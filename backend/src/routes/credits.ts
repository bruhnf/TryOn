import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(requireAuth);

// Get current user's credit balance and daily usage
router.get('/balance', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { credits: true, isSubscribed: true },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Count today's try-on jobs
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayJobCount = await prisma.tryOnJob.count({
    where: {
      userId: req.user.userId,
      createdAt: { gte: startOfDay },
    },
  });

  const DAILY_LIMIT = 15;

  res.json({
    credits: user.credits,
    isSubscribed: user.isSubscribed,
    dailyUsed: todayJobCount,
    dailyLimit: user.isSubscribed ? DAILY_LIMIT : 0,
    dailyRemaining: user.isSubscribed ? Math.max(0, DAILY_LIMIT - todayJobCount) : 0,
  });
});

// Get credit transaction history
router.get('/history', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

  const transactions = await prisma.creditTransaction.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.json({ transactions, page, limit });
});

// Purchase credits (placeholder - would integrate with payment provider)
router.post('/purchase', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { amount, paymentToken } = req.body as { amount?: number; paymentToken?: string };

  if (!amount || amount < 1 || amount > 1000) {
    res.status(400).json({ error: 'Amount must be between 1 and 1000' });
    return;
  }

  if (!paymentToken) {
    res.status(400).json({ error: 'Payment token is required' });
    return;
  }

  // TODO: Integrate with Stripe/payment provider to verify paymentToken
  // For now, this is a placeholder that just adds credits

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.user.userId,
        type: 'PURCHASE',
        amount,
        description: `Purchased ${amount} credits`,
      },
    }),
  ]);

  res.json({ credits: user.credits, purchased: amount });
});

export default router;
