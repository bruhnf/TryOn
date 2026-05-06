import { Router, Request, Response } from 'express';
import { UserTier } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';
import { TIER_CONFIG, grantMonthlyFreeCreditsIfDue } from '../services/tierService';

const router = Router();

router.use(requireAuth);

// Get current user's credit balance, tier, and daily usage
router.get('/balance', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Lazy monthly grant for FREE-tier users
  await grantMonthlyFreeCreditsIfDue(req.user.userId);

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { credits: true, tier: true, tryOnCount: true },
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
      status: { not: 'FAILED' },
    },
  });

  const config = TIER_CONFIG[user.tier];

  res.json({
    credits: user.credits,
    tier: user.tier,
    tryOnCount: user.tryOnCount,
    dailyUsed: todayJobCount,
    dailyLimit: config.dailyLimit,
    dailyRemaining: Math.max(0, config.dailyLimit - todayJobCount),
    creditPrice: config.creditPrice,
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

// Purchase credits — price computed from caller's tier
router.post('/purchase', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { credits, paymentToken } = req.body as {
    credits?: number;
    paymentToken?: string;
  };

  if (!credits || credits < 1 || credits > 1000 || !Number.isInteger(credits)) {
    res.status(400).json({ error: 'credits must be an integer between 1 and 1000' });
    return;
  }

  const current = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { tier: true },
  });
  if (!current) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const pricePerCredit = TIER_CONFIG[current.tier].creditPrice;
  const totalPrice = +(credits * pricePerCredit).toFixed(2);

  // TODO: Integrate with Stripe/RevenueCat to verify paymentToken before granting credits.

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.userId },
      data: { credits: { increment: credits } },
      select: { credits: true, tier: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.user.userId,
        type: 'PURCHASE',
        amount: credits,
        description: `Purchased ${credits} credits at $${pricePerCredit.toFixed(2)} each ($${totalPrice.toFixed(2)})`,
      },
    }),
  ]);

  res.json({
    credits: user.credits,
    purchased: credits,
    pricePerCredit,
    totalPrice,
    tier: user.tier,
  });
});

// Change subscription tier (placeholder — would integrate with payment provider)
router.post('/subscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { tier } = req.body as { tier?: UserTier };
  if (!tier || !['FREE', 'BASIC', 'PREMIUM'].includes(tier)) {
    res.status(400).json({ error: 'tier must be FREE, BASIC, or PREMIUM' });
    return;
  }

  // TODO: validate payment for upgrade to BASIC/PREMIUM via Stripe/RevenueCat.

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { tier },
    select: { credits: true, tier: true },
  });

  res.json({
    success: true,
    tier: user.tier,
    credits: user.credits,
    message: `Tier set to ${user.tier}`,
  });
});

// Cancel subscription — drops user back to FREE
router.post('/unsubscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // TODO: cancel Stripe subscription at period end.

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { tier: 'FREE' },
    select: { credits: true, tier: true },
  });

  res.json({
    success: true,
    tier: user.tier,
    credits: user.credits,
    message: 'Subscription cancelled',
  });
});

export default router;
