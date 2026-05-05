import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { uploadToS3, keyFromUrl } from '../services/s3Service';
import { safeFilename } from '../middleware/uploadMiddleware';
import { enqueueTryOn } from '../queue/tryonQueue';
import { DAILY_TRYON_LIMIT, MAX_CLOTHING_ITEMS } from '../middleware/subscription';
import { resizeImageForTryOn } from '../utils/imageProcessor';
import { createChildLogger, logJob, logUpload } from '../services/logger';

const log = createChildLogger('TryOnController');

export async function submitTryOn(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  log.debug('submitTryOn called', { user: req.user });

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'At least one clothing photo is required' });
    return;
  }

  const { userId } = req.user;

  // Check clothing item limit (same for all users)
  if (files.length > MAX_CLOTHING_ITEMS) {
    res.status(400).json({
      error: `Maximum ${MAX_CLOTHING_ITEMS} clothing item(s) per try-on`,
    });
    return;
  }

  // Fetch fresh subscription, credit, and body photo state from DB — never trust JWT claims for these
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSubscribed: true, credits: true, fullBodyUrl: true, mediumBodyUrl: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const { isSubscribed, credits } = user;

  log.debug('User subscription status (live)', { userId, isSubscribed, credits });

  // Check if user can generate (needs subscription or credits)
  if (!isSubscribed && credits <= 0) {
    log.info('Try-on blocked: no subscription or credits', { userId, isSubscribed, credits });
    res.status(403).json({
      error: 'SUBSCRIPTION_REQUIRED',
      message: 'Please subscribe or purchase credits to use try-on.',
    });
    return;
  }

  // Check daily limit for subscribers
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.tryOnJob.count({
    where: { userId, createdAt: { gte: todayStart }, status: { not: 'FAILED' } },
  });

  // Subscribers get daily limit, non-subscribers must use credits
  let useCredit = false;
  if (isSubscribed) {
    if (todayCount >= DAILY_TRYON_LIMIT) {
      // Subscriber exceeded daily limit - check if they have credits
      if (credits <= 0) {
        res.status(429).json({
          error: 'DAILY_LIMIT_REACHED',
          message: `Daily limit of ${DAILY_TRYON_LIMIT} reached. Purchase credits for more try-ons.`,
          dailyUsed: todayCount,
          dailyLimit: DAILY_TRYON_LIMIT,
        });
        return;
      }
      useCredit = true;
    }
  } else {
    // Non-subscriber must use credits
    useCredit = true;
  }

  // Deduct credit if needed
  if (useCredit) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: 1 } },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          type: 'USAGE',
          amount: -1,
          description: 'Try-on generation',
        },
      }),
    ]);
  }

  const bodyPhotos: Array<{ perspective: 'full_body' | 'medium'; url: string }> = [];
  if (user.fullBodyUrl) bodyPhotos.push({ perspective: 'full_body', url: user.fullBodyUrl });
  if (user.mediumBodyUrl) bodyPhotos.push({ perspective: 'medium', url: user.mediumBodyUrl });

  // Primary body photo for display: full body preferred, medium as fallback
  const bodyPhotoUrl = user.fullBodyUrl ?? user.mediumBodyUrl ?? null;

  if (bodyPhotos.length === 0) {
    res.status(422).json({
      error: 'NO_BODY_PHOTOS',
      message:
        'To use try-on, please upload a full body or medium (waist-up) photo in your profile.',
    });
    return;
  }

  // Upload clothing photos to S3 (resize to 576x1024 first)
  const clothingUrls: string[] = [];
  for (const file of files) {
    // Resize image to 576x1024 portrait
    const processed = await resizeImageForTryOn(file.buffer);
    const baseFilename = safeFilename(file.originalname).replace(/\.[^/.]+$/, '');
    const filename = `${uuidv4()}-${baseFilename}.jpg`;
    const key = await uploadToS3('clothing-photos', userId, filename, processed.buffer, processed.mimeType);
    clothingUrls.push(
      `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    );
  }

  const jobId = uuidv4();
  const isPrivate = req.body?.isPrivate === true || req.body?.isPrivate === 'true';
  await prisma.tryOnJob.create({
    data: {
      id: jobId,
      userId,
      isPrivate,
      clothingPhoto1Url: clothingUrls[0],
      clothingPhoto2Url: clothingUrls[1] ?? null,
      bodyPhotoUrl,
      perspectivesUsed: [],
    },
  });

  await enqueueTryOn({ jobId, userId, clothingUrls, bodyPhotos });

  res.status(202).json({ jobId, status: 'PENDING' });
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobId } = req.params;
  const job = await prisma.tryOnJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== req.user.userId) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(job);
}

export async function getTryOnHistory(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = 20;

  const jobs = await prisma.tryOnJob.findMany({
    where: { userId: req.user.userId, status: 'COMPLETE' },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.json({ jobs, page });
}

export async function updateJobPrivacy(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobId } = req.params;
  const { isPrivate } = req.body;

  if (typeof isPrivate !== 'boolean') {
    res.status(400).json({ error: 'isPrivate must be a boolean' });
    return;
  }

  const job = await prisma.tryOnJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== req.user.userId) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const updated = await prisma.tryOnJob.update({
    where: { id: jobId },
    data: { isPrivate },
  });

  res.json(updated);
}
