import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = 20;

  // Show completed try-on jobs from users the current user follows + their own
  const following = await prisma.follow.findMany({
    where: { followerId: req.user.userId },
    select: { followingId: true },
  });
  const followingIds = [req.user.userId, ...following.map((f) => f.followingId)];

  const jobs = await prisma.tryOnJob.findMany({
    where: { userId: { in: followingIds }, status: 'COMPLETE' },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      user: { select: { username: true, avatarUrl: true } },
    },
  });

  res.json({ jobs, page });
});

export default router;
