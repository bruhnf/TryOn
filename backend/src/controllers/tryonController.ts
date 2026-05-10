import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { uploadToS3, keyFromUrl } from '../services/s3Service';
import { presignTryOnJob, presignTryOnJobs, presignAvatarOnly } from '../services/imageUrlService';
import { safeFilename } from '../middleware/uploadMiddleware';
import { enqueueTryOn } from '../queue/tryonQueue';
import { MAX_CLOTHING_ITEMS } from '../middleware/subscription';
import { TIER_CONFIG } from '../services/tierService';
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

  // Fetch fresh tier, credit, and body photo state from DB — never trust JWT claims for these
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, credits: true, fullBodyUrl: true, mediumBodyUrl: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const { tier, credits } = user;
  const weeklyLimit = TIER_CONFIG[tier].weeklyLimit;

  log.debug('User tier status (live)', { userId, tier, credits, weeklyLimit });

  // FREE tier (no weekly allowance) needs credits
  if (weeklyLimit <= 0 && credits <= 0) {
    log.info('Try-on blocked: no weekly allowance or credits', { userId, tier, credits });
    res.status(403).json({
      error: 'SUBSCRIPTION_REQUIRED',
      message: 'Please upgrade or purchase credits to use try-on.',
    });
    return;
  }

  // Count non-failed jobs in the rolling 7-day window to enforce the weekly limit.
  // Rolling window (rather than calendar week) keeps the reset gradual: usage
  // ages out continuously, so a user can't burn the full quota at the end of
  // one week and the start of the next.
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekCount = await prisma.tryOnJob.count({
    where: { userId, createdAt: { gte: weekStart }, status: { not: 'FAILED' } },
  });

  // If user has any weekly allowance left, use it (free); otherwise fall back to credits
  let useCredit = false;
  if (weeklyLimit > 0 && weekCount < weeklyLimit) {
    useCredit = false;
  } else {
    if (credits <= 0) {
      res.status(429).json({
        error: 'WEEKLY_LIMIT_REACHED',
        message: weeklyLimit > 0
          ? `Weekly limit of ${weeklyLimit} reached. Purchase credits for more try-ons.`
          : 'No credits remaining. Purchase credits to use try-on.',
        weeklyUsed: weekCount,
        weeklyLimit,
      });
      return;
    }
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

  // Upload clothing photos to S3 (resize to 576x1024 first).
  // Stores S3 keys, not public URLs — bucket is private; presigned URLs are
  // minted at read time by imageUrlService.
  const clothingKeys: string[] = [];
  for (const file of files) {
    const processed = await resizeImageForTryOn(file.buffer);
    const baseFilename = safeFilename(file.originalname).replace(/\.[^/.]+$/, '');
    const filename = `${uuidv4()}-${baseFilename}.jpg`;
    const key = await uploadToS3('clothing-photos', userId, filename, processed.buffer, processed.mimeType);
    clothingKeys.push(key);
  }

  const jobId = uuidv4();
  const isPrivate = req.body?.isPrivate === true || req.body?.isPrivate === 'true';
  await prisma.tryOnJob.create({
    data: {
      id: jobId,
      userId,
      isPrivate,
      clothingPhoto1Url: clothingKeys[0],
      clothingPhoto2Url: clothingKeys[1] ?? null,
      bodyPhotoUrl,
      perspectivesUsed: [],
    },
  });

  // Worker reads from S3 via SDK using these keys — no public URL needed.
  await enqueueTryOn({ jobId, userId, clothingUrls: clothingKeys, bodyPhotos });

  res.status(202).json({ jobId, status: 'PENDING' });
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobId } = req.params;
  const job = await prisma.tryOnJob.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  // Visibility: owner can always read (including in-progress / failed jobs);
  // non-owners can only read public completed posts. This is also what the
  // mobile poll loop hits for its own jobs and what TryOnCommentsScreen hits
  // when opening someone else's post from the feed.
  const isOwner = job.userId === req.user.userId;
  if (!isOwner && job.isPrivate) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const { user, ...rest } = job;
  const [presignedJob, presignedUser] = await Promise.all([
    presignTryOnJob(rest),
    presignAvatarOnly(user),
  ]);
  res.json({ ...presignedJob, user: presignedUser });
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

  res.json({ jobs: await presignTryOnJobs(jobs), page });
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

  res.json(await presignTryOnJob(updated));
}
