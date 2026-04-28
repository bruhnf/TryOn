import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(requireAdmin);

router.get('/users', async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      verified: true,
      subscriptionLevel: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(users);
});

router.get('/jobs', async (_req: Request, res: Response) => {
  const jobs = await prisma.tryOnJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { username: true } } },
  });
  res.json(jobs);
});

router.delete('/user/:userId', async (req: Request, res: Response) => {
  await prisma.user.delete({ where: { id: req.params.userId } });
  res.json({ message: 'User deleted' });
});

router.patch('/user/:userId/verify', async (req: Request, res: Response) => {
  const { verified } = req.body as { verified?: boolean };
  if (typeof verified !== 'boolean') {
    res.status(400).json({ error: 'verified must be a boolean' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { verified },
    select: { id: true, username: true, email: true, verified: true },
  });
  res.json(user);
});

router.patch('/user/:userId/subscription', async (req: Request, res: Response) => {
  const { subscriptionLevel } = req.body as { subscriptionLevel?: string };
  if (!subscriptionLevel || !['BASIC', 'PRO', 'PREMIUM'].includes(subscriptionLevel)) {
    res.status(400).json({ error: 'subscriptionLevel must be BASIC, PRO, or PREMIUM' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { subscriptionLevel: subscriptionLevel as 'BASIC' | 'PRO' | 'PREMIUM' },
    select: { id: true, username: true, email: true, subscriptionLevel: true },
  });
  res.json(user);
});

router.get('/stats', async (_req: Request, res: Response) => {
  const [userCount, jobCount, completedJobs] = await Promise.all([
    prisma.user.count(),
    prisma.tryOnJob.count(),
    prisma.tryOnJob.count({ where: { status: 'COMPLETE' } }),
  ]);
  res.json({ userCount, jobCount, completedJobs });
});

export default router;
