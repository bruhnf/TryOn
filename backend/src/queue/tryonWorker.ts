import { Worker } from 'bullmq';
import { connection, TryOnJobData } from './tryonQueue';
import { generateTryOnImage } from '../services/grokService';
import { uploadToS3 } from '../services/s3Service';
import prisma from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';

const worker = new Worker<TryOnJobData>(
  'tryon',
  async (job) => {
    const { jobId, userId, clothingUrls, bodyPhotos } = job.data;

    console.log('\n========== TRYON WORKER START ==========');
    console.log('Job ID:', jobId);
    console.log('User ID:', userId);
    console.log('Clothing URLs:', clothingUrls);
    console.log('Body Photos:', bodyPhotos);
    console.log('=========================================\n');

    await prisma.tryOnJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    const results: { full_body?: string; medium?: string } = {};

    for (const bodyPhoto of bodyPhotos) {
      console.log(`[Worker] Processing perspective: ${bodyPhoto.perspective}`);
      console.log(`[Worker] Body image URL: ${bodyPhoto.url}`);
      console.log(`[Worker] Clothing URLs: ${clothingUrls.join(', ')}`);

      // grokService now fetches from S3 directly - pass raw URLs
      const resultUrl = await generateTryOnImage({
        userBodyImageUrl: bodyPhoto.url,
        perspective: bodyPhoto.perspective,
        clothingImageUrls: clothingUrls,
      });

      console.log(`[Worker] Got result URL (length: ${resultUrl.length})`);

      // If the result is a URL already (hosted), use as-is
      // If it's base64, upload to S3
      let finalUrl = resultUrl;
      if (resultUrl.startsWith('data:')) {
        console.log('[Worker] Result is base64, uploading to S3...');
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
        console.log('[Worker] Uploaded result to S3:', finalUrl);
      }

      results[bodyPhoto.perspective] = finalUrl;
    }

    console.log('[Worker] All perspectives complete:', Object.keys(results));

    await prisma.tryOnJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETE',
        resultFullBodyUrl: results.full_body,
        resultMediumUrl: results.medium,
        perspectivesUsed: bodyPhotos.map((p) => p.perspective),
      },
    });

    console.log('========== TRYON WORKER SUCCESS ==========\n');
  },
  { connection, concurrency: 3 },
);

worker.on('failed', async (job, err) => {
  console.error('\n========== TRYON WORKER FAILED ==========');
  console.error('Job ID:', job?.id);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  console.error('==========================================\n');
  
  if (job?.data?.jobId) {
    try {
      await prisma.tryOnJob.update({
        where: { id: job.data.jobId },
        data: { status: 'FAILED', errorMessage: err.message?.substring(0, 500) || 'Unknown error' },
      });
    } catch (dbErr) {
      console.error('[Worker] Failed to update job status in database:', dbErr);
    }
  }
});

worker.on('completed', (job) => {
  console.log(`[Worker] TryOn job ${job.id} completed successfully`);
});

export default worker;
