import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

export const connection = new IORedis(env.redis.url, { maxRetriesPerRequest: null });

export const tryonQueue = new Queue('tryon', { connection });

export interface TryOnJobData {
  jobId: string;
  userId: string;
  clothingUrls: string[];
  bodyPhotos: Array<{ perspective: 'full_body' | 'medium'; url: string }>;
}

export async function enqueueTryOn(data: TryOnJobData, delayMs = 0): Promise<void> {
  await tryonQueue.add('process', data, {
    jobId: data.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    // BullMQ defers the job by this many ms before the first attempt. The
    // delay only applies to the initial run; retries still use the backoff
    // policy above.
    ...(delayMs > 0 ? { delay: delayMs } : {}),
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
