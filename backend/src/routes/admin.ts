import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth';
import prisma from '../lib/prisma';
import { hashPassword } from '../utils/password';

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

// Create test user
router.post('/users', async (req: Request, res: Response) => {
  const { firstName, lastName, username, email, password } = req.body as { 
    firstName?: string; 
    lastName?: string; 
    username?: string; 
    email?: string; 
    password?: string;
  };
  
  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, and password are required' });
    return;
  }
  
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    res.status(409).json({ error: existing.email === email ? 'Email already in use' : 'Username taken' });
    return;
  }
  
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { firstName, lastName, username, email, passwordHash, verified: true },
    select: { id: true, username: true, email: true, verified: true, credits: true },
  });
  
  res.status(201).json(user);
});

// Get single user with locations
router.get('/user/:userId', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: {
      id: true,
      username: true,
      email: true,
      verified: true,
      isSubscribed: true,
      credits: true,
      firstName: true,
      lastName: true,
      bio: true,
      avatarUrl: true,
      fullBodyUrl: true,
      mediumBodyUrl: true,
      followingCount: true,
      followersCount: true,
      likesCount: true,
      address: true,
      city: true,
      state: true,
      createdAt: true,
      updatedAt: true,
      locations: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
    },
  });
  
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  
  res.json(user);
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

// Security stats
router.get('/security/stats', async (_req: Request, res: Response) => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const [last24Hours, last7Days, total, uniqueUsers] = await Promise.all([
    prisma.userLocation.count({
      where: { suspiciousLocation: true, timestamp: { gte: oneDayAgo } },
    }),
    prisma.userLocation.count({
      where: { suspiciousLocation: true, timestamp: { gte: sevenDaysAgo } },
    }),
    prisma.userLocation.count({
      where: { suspiciousLocation: true },
    }),
    prisma.userLocation.groupBy({
      by: ['userId'],
      where: { suspiciousLocation: true },
    }).then(groups => groups.length),
  ]);
  
  res.json({ last24Hours, last7Days, total, uniqueUsers });
});

// Suspicious logins list
router.get('/security/suspicious', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  
  const locations = await prisma.userLocation.findMany({
    where: { suspiciousLocation: true },
    orderBy: { timestamp: 'desc' },
    take: limit,
    include: {
      user: {
        select: { username: true, email: true },
      },
    },
  });
  
  res.json(locations);
});

export default router;
