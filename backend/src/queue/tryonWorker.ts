import { Worker } from 'bullmq';
import { connection, TryOnJobData } from './tryonQueue';
import { generateTryOnImage } from '../services/grokService';
import { uploadToS3 } from '../services/s3Service';
import prisma from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger, logJob, logUpload } from '../services/logger';

const log = createChildLogger('TryOnWorker');

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
        bodyImageUrl: bodyPhoto.url.substring(0, 80),
      });

      // grokService now fetches from S3 directly - pass raw URLs
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
      });

      // If the result is a URL already (hosted), use as-is
      // If it's base64, upload to S3
      let finalUrl = resultUrl;
      if (resultUrl.startsWith('data:')) {
        log.debug('Uploading base64 result to S3', { jobId, perspective: bodyPhoto.perspective });
        const base64Data = resultUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const key = await uploadToS3(
          'tryon-results',
          userId,
          `${uuidv4()}.jpg`,
          buffer,
          'image/jpeg',
        );
        finalUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        
        logUpload('completed', {
          userId,
          fileType: 'tryon-result',
          s3Key: key,
          fileSize: buffer.length,
          success: true,
        });
      }

      results[bodyPhoto.perspective] = finalUrl;
    }

    const durationMs = Date.now() - startTime;

    await prisma.tryOnJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETE',
        resultFullBodyUrl: results.full_body,
        resultMediumUrl: results.medium,
        perspectivesUsed: bodyPhotos.map((p) => p.perspective),
      },
    });

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
  logJob('failed', {
    jobId: job?.data?.jobId || job?.id || 'unknown',
    jobType: 'tryon',
    userId: job?.data?.userId,
    attempt: job?.attemptsMade,
    error: err.message,
  });

  // Log full stack for debugging
  log.error('Job failed with stack trace', {
    jobId: job?.data?.jobId,
    stack: err.stack,
  });
  
  if (job?.data?.jobId) {
    try {
      await prisma.tryOnJob.update({
        where: { id: job.data.jobId },
        data: { status: 'FAILED', errorMessage: err.message?.substring(0, 500) || 'Unknown error' },
      });
    } catch (dbErr: unknown) {
      log.error('Failed to update job status in database', { 
        jobId: job.data.jobId, 
        error: (dbErr as Error).message,
      });
    }
  }
});

worker.on('completed', (job) => {
  log.debug('Job completed event', { bullmqJobId: job.id });
});

export default worker;
