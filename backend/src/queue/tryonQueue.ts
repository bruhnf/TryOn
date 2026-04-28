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

export async function enqueueTryOn(data: TryOnJobData): Promise<void> {
  await tryonQueue.add('process', data, {
    jobId: data.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
