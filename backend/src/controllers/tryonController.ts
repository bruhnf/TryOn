import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { uploadToS3, keyFromUrl } from '../services/s3Service';
import { safeFilename } from '../middleware/uploadMiddleware';
import { enqueueTryOn } from '../queue/tryonQueue';
import { DAILY_TRYON_LIMIT, MAX_CLOTHING_ITEMS } from '../middleware/subscription';
import { resizeImageForTryOn } from '../utils/imageProcessor';

export async function submitTryOn(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  console.log('[submitTryOn] req.user:', JSON.stringify(req.user));

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'At least one clothing photo is required' });
    return;
  }

  const { userId, isSubscribed, credits } = req.user;
  
  console.log(`[submitTryOn] userId=${userId}, isSubscribed=${isSubscribed}, credits=${credits}`);

  // Check clothing item limit (same for all users)
  if (files.length > MAX_CLOTHING_ITEMS) {
    res.status(400).json({
      error: `Maximum ${MAX_CLOTHING_ITEMS} clothing item(s) per try-on`,
    });
    return;
  }

  // Check if user can generate (needs subscription or credits)
  if (!isSubscribed && credits <= 0) {
    console.log('[submitTryOn] SUBSCRIPTION_REQUIRED - isSubscribed:', isSubscribed, 'credits:', credits);
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

  // Determine which body photos are available (full body takes priority, never avatar/close-up)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullBodyUrl: true, mediumBodyUrl: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const bodyPhotos: Array<{ perspective: 'full_body' | 'medium'; url: string }> = [];
  if (user.fullBodyUrl) bodyPhotos.push({ perspective: 'full_body', url: user.fullBodyUrl });
  if (user.mediumBodyUrl) bodyPhotos.push({ perspective: 'medium', url: user.mediumBodyUrl });

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
