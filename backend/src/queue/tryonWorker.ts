import { Worker } from 'bullmq';
import { connection, TryOnJobData } from './tryonQueue';
import { generateTryOnImage } from '../services/grokService';
import { uploadToS3 } from '../services/s3Service';
import prisma from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger, logJob, logUpload } from '../services/logger';

const log = createChildLogger('TryOnWorker');

/**
 * Download image from URL and return as Buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const worker = new Worker<TryOnJobData>(
  'tryon',
  async (job) => {
    const { jobId, userId, clothingUrls, bodyPhotos } = job.data;
    const startTime = Date.now();

    logJob('started', {
      jobId,
      jobType: 'tryon',
      userId,
      attempt: job.attemptsMade + 1,
      clothingCount: clothingUrls.length,
      perspectives: bodyPhotos.map(p => p.perspective),
    });

    await prisma.tryOnJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    const results: { full_body?: string; medium?: string } = {};

    for (const bodyPhoto of bodyPhotos) {
      log.debug('Processing perspective', {
        jobId,
        perspective: bodyPhoto.perspective,
        bodyImageRef: bodyPhoto.url.substring(0, 80),
      });

      // grokService accepts S3 keys (preferred) or full URLs (legacy rows).
      const resultUrl = await generateTryOnImage({
        userBodyImageUrl: bodyPhoto.url,
        perspective: bodyPhoto.perspective,
        clothingImageUrls: clothingUrls,
      });

      log.debug('Got result from Grok', {
        jobId,
        perspective: bodyPhoto.perspective,
        resultLength: resultUrl.length,
        isBase64: resultUrl.startsWith('data:'),
        isUrl: resultUrl.startsWith('http'),
      });

      // Always upload result to S3 for permanent storage
      // Grok returns either base64 data or a temporary URL that will expire
      let buffer: Buffer;
      
      if (resultUrl.startsWith('data:')) {
        // Base64 encoded image
        log.debug('Converting base64 result to buffer', { jobId, perspective: bodyPhoto.perspective });
        const base64Data = resultUrl.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (resultUrl.startsWith('http')) {
        // URL to temporary hosted image - download it
        log.debug('Downloading result from Grok URL', { jobId, perspective: bodyPhoto.perspective, url: resultUrl.substring(0, 60) });
        buffer = await downloadImage(resultUrl);
      } else {
        throw new Error(`Unexpected result format from Grok: ${resultUrl.substring(0, 50)}`);
      }

      // Upload to S3 — store the key only; presigned URLs are minted at read time.
      log.debug('Uploading result to S3', { jobId, perspective: bodyPhoto.perspective, bufferSize: buffer.length });
      const key = await uploadToS3(
        'tryon-results',
        userId,
        `${uuidv4()}.jpg`,
        buffer,
        'image/jpeg',
      );

      logUpload('completed', {
        userId,
        fileType: 'tryon-result',
        s3Key: key,
        fileSize: buffer.length,
        success: true,
        perspective: bodyPhoto.perspective,
      });

      results[bodyPhoto.perspective] = key;
    }

    const durationMs = Date.now() - startTime;

    await prisma.$transaction([
      prisma.tryOnJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETE',
          resultFullBodyUrl: results.full_body,
          resultMediumUrl: results.medium,
          perspectivesUsed: bodyPhotos.map((p) => p.perspective),
        },
      }),
      // Increment lifetime try-on counter only on successful completion
      prisma.user.update({
        where: { id: userId },
        data: { tryOnCount: { increment: 1 } },
      }),
    ]);

    logJob('completed', {
      jobId,
      jobType: 'tryon',
      userId,
      durationMs,
      perspectivesCompleted: Object.keys(results),
    });
  },
  { connection, concurrency: 3 },
);

worker.on('failed', async (job, err) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = (job?.opts?.attempts as number | undefined) ?? 1;
  const isTerminal = attemptsMade >= maxAttempts;

  logJob('failed', {
    jobId: job?.data?.jobId || job?.id || 'unknown',
    jobType: 'tryon',
    userId: job?.data?.userId,
    attempt: attemptsMade,
    maxAttempts,
    isTerminal,
    error: err.message,
  });

  log.error('Job failed with stack trace', {
    jobId: job?.data?.jobId,
    stack: err.stack,
  });

  // Non-terminal failure: BullMQ will retry. Leave the DB row in PROCESSING
  // (set at the start of the attempt) and don't refund — the credit only
  // needs returning if the final attempt also fails.
  if (!isTerminal) return;

  const jobId = job?.data?.jobId;
  const userId = job?.data?.userId;
  if (!jobId) return;

  try {
    await prisma.tryOnJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: err.message?.substring(0, 500) || 'Unknown error' },
    });
  } catch (dbErr: unknown) {
    log.error('Failed to update job status in database', {
      jobId,
      error: (dbErr as Error).message,
    });
  }

  // Refund the credit if one was deducted at submit time. tryonController
  // tags the USAGE transaction with `(job=<jobId>)` for exactly this lookup.
  // Idempotency: if a REFUND for this jobId already exists (e.g. a prior
  // failed handler invocation), skip — avoids double-refund on duplicate
  // failure events.
  if (!userId) return;
  try {
    const usage = await prisma.creditTransaction.findFirst({
      where: {
        userId,
        type: 'USAGE',
        description: { contains: `job=${jobId}` },
      },
    });
    if (!usage) return;

    const existingRefund = await prisma.creditTransaction.findFirst({
      where: {
        userId,
        type: 'REFUND',
        description: { contains: `job=${jobId}` },
      },
    });
    if (existingRefund) {
      log.info('Refund already issued for failed job — skipping', { jobId, userId });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: 1 } },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          type: 'REFUND',
          amount: 1,
          description: `Refund: try-on failed (job=${jobId})`,
        },
      }),
    ]);
    log.info('Refunded credit for terminally failed job', { jobId, userId });
  } catch (refundErr: unknown) {
    log.error('Failed to refund credit for failed job', {
      jobId,
      userId,
      error: (refundErr as Error).message,
    });
  }
});

worker.on('completed', (job) => {
  log.debug('Job completed event', { bullmqJobId: job.id });
});

export default worker;
