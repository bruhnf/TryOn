import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { uploadToS3, deleteFromS3, keyFromUrl } from '../services/s3Service';
import { presignTryOnJob, presignTryOnJobs, presignAvatarOnly } from '../services/imageUrlService';
import { safeFilename } from '../middleware/uploadMiddleware';
import { enqueueTryOn } from '../queue/tryonQueue';
import { MAX_CLOTHING_ITEMS } from '../middleware/subscription';
import { TIER_CONFIG } from '../services/tierService';
import { computeQueueDelayMs } from '../services/throttleService';
import { resizeImageForTryOn } from '../utils/imageProcessor';
import { createChildLogger, logJob, logUpload } from '../services/logger';

const log = createChildLogger('TryOnController');

// Per-user storage cap for stored TryOn sessions. Result images and the
// associated clothing/source photos add up over time; users hit this limit
// and must delete some sessions in their Profile before they can run another
// try-on.
export const TRYON_STORAGE_LIMIT = 500;

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
    select: {
      tier: true,
      credits: true,
      fullBodyUrl: true,
      mediumBodyUrl: true,
      aiProcessingConsentAt: true,
    },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // App Store Review Guidelines 5.1.1(i) / 5.1.2(i): explicit user consent is
  // required before transmitting personal data to a third-party AI service.
  // The mobile app surfaces an opt-in dialog naming xAI / Grok Imagine before
  // the first submit, then POSTs /api/profile/me/ai-consent to set this
  // timestamp. Without it, refuse before any S3 upload or credit deduction.
  if (!user.aiProcessingConsentAt) {
    res.status(403).json({
      error: 'AI_CONSENT_REQUIRED',
      message:
        'Before generating a try-on, please review and accept the disclosure that your body and clothing photos will be sent to xAI (Grok Imagine API) for processing.',
    });
    return;
  }

  // Storage cap: count non-failed jobs (failed jobs have no stored results
  // so they don't contribute). If at or above the cap, refuse the new job
  // before any S3 upload or credit deduction so honest users don't pay for
  // a try-on they can't store.
  const storedCount = await prisma.tryOnJob.count({
    where: { userId, status: { not: 'FAILED' } },
  });
  if (storedCount >= TRYON_STORAGE_LIMIT) {
    log.info('Try-on blocked: storage limit reached', { userId, storedCount });
    res.status(403).json({
      error: 'TRYON_LIMIT_REACHED',
      message: `You've reached the ${TRYON_STORAGE_LIMIT}-session storage limit. Delete some sessions from your Profile to continue.`,
      stored: storedCount,
      limit: TRYON_STORAGE_LIMIT,
    });
    return;
  }

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

  // Pre-allocate the jobId so we can tag the credit-deduction transaction
  // with it. The worker's failure handler uses this tag to find and refund
  // the deduction if the job fails terminally.
  const jobId = uuidv4();

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
          // The `job=<id>` token is parsed by the worker on terminal failure
          // to refund the user. Don't change this format without updating
          // queue/tryonWorker.ts.
          description: `Try-on generation (job=${jobId})`,
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
  const isPrivate = req.body?.isPrivate === true || req.body?.isPrivate === 'true';

  // Soft per-user throttle. Bursts beyond the tier-specific free quota get
  // a BullMQ delay (1/3/5/10 min ladder) so rapid-fire submissions are
  // paced without a hard 429. The client renders a countdown from
  // `scheduledStartAt`.
  const throttle = await computeQueueDelayMs(userId, tier);
  const scheduledStartAt = throttle.delayMs > 0
    ? new Date(Date.now() + throttle.delayMs)
    : null;
  if (throttle.delayMs > 0) {
    log.info('Try-on submission throttled', {
      userId,
      tier,
      ordinal: throttle.ordinal,
      burst: throttle.burst,
      delayMs: throttle.delayMs,
      jobId,
    });
  }

  await prisma.tryOnJob.create({
    data: {
      id: jobId,
      userId,
      isPrivate,
      clothingPhoto1Url: clothingKeys[0],
      clothingPhoto2Url: clothingKeys[1] ?? null,
      bodyPhotoUrl,
      perspectivesUsed: [],
      creditsAtTime: user.credits,
      scheduledStartAt,
    },
  });

  // Worker reads from S3 via SDK using these keys — no public URL needed.
  await enqueueTryOn(
    { jobId, userId, clothingUrls: clothingKeys, bodyPhotos },
    throttle.delayMs,
  );

  res.status(202).json({
    jobId,
    status: 'PENDING',
    scheduledStartAt,
    queueDelayMs: throttle.delayMs,
  });
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

// Bulk-delete sessions owned by the requesting user. Used by the multi-select
// flow on the user's own Profile screen.
//
// We only delete jobs that belong to the requester — Prisma's deleteMany with
// { userId, id: { in } } enforces this on the DB. Cascades on the FK
// relationships clean up Likes, Comments, and Notifications referencing the
// deleted jobs (see schema.prisma).
//
// Best-effort S3 cleanup: each job has unique-per-job clothing photo and
// result image keys; we delete those. We deliberately do NOT delete
// `bodyPhotoUrl` because it points at the user's own body photo which is
// shared across many jobs and managed via the Profile photo controls.
export async function bulkDeleteJobs(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobIds } = req.body as { jobIds?: unknown };
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    res.status(400).json({ error: 'jobIds must be a non-empty array' });
    return;
  }
  if (jobIds.some((id) => typeof id !== 'string')) {
    res.status(400).json({ error: 'jobIds must be strings' });
    return;
  }
  if (jobIds.length > TRYON_STORAGE_LIMIT) {
    res.status(400).json({ error: `Cannot delete more than ${TRYON_STORAGE_LIMIT} sessions at once` });
    return;
  }

  const userId = req.user.userId;
  const ids = jobIds as string[];

  // Look up the jobs we're about to delete so we can clean up S3 keys after.
  // Filter by userId so a malicious caller cannot enumerate or delete other
  // users' jobs by guessing IDs.
  const jobs = await prisma.tryOnJob.findMany({
    where: { id: { in: ids }, userId },
    select: {
      id: true,
      clothingPhoto1Url: true,
      clothingPhoto2Url: true,
      resultFullBodyUrl: true,
      resultMediumUrl: true,
    },
  });

  if (jobs.length === 0) {
    res.json({ deleted: 0 });
    return;
  }

  const deletableIds = jobs.map((j) => j.id);
  const result = await prisma.tryOnJob.deleteMany({
    where: { id: { in: deletableIds }, userId },
  });

  // Fire-and-forget S3 cleanup — the user's API response shouldn't wait on
  // (and shouldn't fail because of) S3 delete latency. Orphaned objects can
  // be cleaned up later by a sweep job.
  const keysToDelete: string[] = [];
  for (const j of jobs) {
    if (j.clothingPhoto1Url) keysToDelete.push(keyFromUrl(j.clothingPhoto1Url));
    if (j.clothingPhoto2Url) keysToDelete.push(keyFromUrl(j.clothingPhoto2Url));
    if (j.resultFullBodyUrl) keysToDelete.push(keyFromUrl(j.resultFullBodyUrl));
    if (j.resultMediumUrl) keysToDelete.push(keyFromUrl(j.resultMediumUrl));
  }
  for (const key of keysToDelete) {
    deleteFromS3(key).catch((err) => {
      log.warn('S3 cleanup failed for deleted try-on', {
        userId, key, error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  log.info('Bulk-deleted try-on sessions', {
    userId,
    requestedCount: ids.length,
    deletedCount: result.count,
    s3KeysQueued: keysToDelete.length,
  });

  res.json({ deleted: result.count });
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
