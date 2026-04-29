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
      isSubscribed: true,
      credits: true,
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
  const { isSubscribed } = req.body as { isSubscribed?: boolean };
  if (typeof isSubscribed !== 'boolean') {
    res.status(400).json({ error: 'isSubscribed must be a boolean' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { isSubscribed },
    select: { id: true, username: true, email: true, isSubscribed: true, credits: true },
  });
  res.json(user);
});

router.patch('/user/:userId/credits', async (req: Request, res: Response) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  if (typeof amount !== 'number' || amount === 0) {
    res.status(400).json({ error: 'amount must be a non-zero number' });
    return;
  }
  
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.params.userId },
      data: { credits: { increment: amount } },
      select: { id: true, username: true, email: true, credits: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.params.userId,
        type: amount > 0 ? 'GRANT' : 'USAGE',
        amount,
        description: reason || (amount > 0 ? 'Admin credit grant' : 'Admin credit deduction'),
      },
    }),
  ]);
  
  res.json(user);
});

router.get('/stats', async (_req: Request, res: Response) => {
  const [userCount, jobCount, completedJobs, subscriberCount, totalCredits] = await Promise.all([
    prisma.user.count(),
    prisma.tryOnJob.count(),
    prisma.tryOnJob.count({ where: { status: 'COMPLETE' } }),
    prisma.user.count({ where: { isSubscribed: true } }),
    prisma.user.aggregate({ _sum: { credits: true } }),
  ]);
  res.json({ 
    userCount, 
    jobCount, 
    completedJobs, 
    subscriberCount,
    totalCreditsOutstanding: totalCredits._sum.credits || 0,
  });
});

export default router;
