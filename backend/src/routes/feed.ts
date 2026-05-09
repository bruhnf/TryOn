import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getInvisibleUserIds } from '../utils/blocks';
import { presignTryOnJob, presignAvatarOnly } from '../services/imageUrlService';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = 20;
  const userId = req.user.userId;

  // Exclude content from users involved in a block relationship in either
  // direction. Apple Guideline 1.2 requires blocked users be hidden.
  const invisibleUserIds = await getInvisibleUserIds(userId);

  const baseWhere = {
    status: 'COMPLETE' as const,
    isPrivate: false,
    userId: { notIn: invisibleUserIds },
  };

  const totalPublicJobs = await prisma.tryOnJob.count({ where: baseWhere });

  const jobs = await prisma.tryOnJob.findMany({
    where: baseWhere,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      user: { select: { username: true, firstName: true, lastName: true, avatarUrl: true } },
      likes: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  // Map likes[] to a simple `liked` boolean per job for the current user, and
  // mint presigned URLs for both the result images and the embedded avatar.
  const decorated = await Promise.all(
    jobs.map(async (j) => {
      const { likes, user, ...rest } = j;
      const [presignedJob, presignedUser] = await Promise.all([
        presignTryOnJob(rest),
        presignAvatarOnly(user),
      ]);
      return { ...presignedJob, user: presignedUser, liked: likes.length > 0 };
    }),
  );

  const shuffled = decorated.sort(() => Math.random() - 0.5);

  res.json({ jobs: shuffled, page, hasMore: totalPublicJobs > page * limit });
});

export default router;
