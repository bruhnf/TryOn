import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = 20;
  const userId = req.user.userId;

  // Show public completed try-on jobs from all users
  const totalPublicJobs = await prisma.tryOnJob.count({
    where: { status: 'COMPLETE', isPrivate: false },
  });

  const jobs = await prisma.tryOnJob.findMany({
    where: { status: 'COMPLETE', isPrivate: false },
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

  // Map likes[] to a simple `liked` boolean per job for the current user
  const decorated = jobs.map((j) => {
    const { likes, ...rest } = j;
    return { ...rest, liked: likes.length > 0 };
  });

  const shuffled = decorated.sort(() => Math.random() - 0.5);

  res.json({ jobs: shuffled, page, hasMore: totalPublicJobs > page * limit });
});

export default router;
