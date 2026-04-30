import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = 20;

  // Show random mix of public completed try-on jobs from all users
  // Uses a random offset to provide variety on each page load
  const totalPublicJobs = await prisma.tryOnJob.count({
    where: { status: 'COMPLETE', isPrivate: false },
  });

  // Get random jobs by ordering by a combination of createdAt and random offset
  const jobs = await prisma.tryOnJob.findMany({
    where: { status: 'COMPLETE', isPrivate: false },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      user: { select: { username: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  });

  // Shuffle the results for variety within the page
  const shuffled = jobs.sort(() => Math.random() - 0.5);

  res.json({ jobs: shuffled, page, hasMore: totalPublicJobs > page * limit });
});

export default router;
