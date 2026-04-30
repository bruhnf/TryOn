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

// Credit packages configuration
const CREDIT_PACKAGES: Record<string, { credits: number; price: number }> = {
  credits_10: { credits: 10, price: 5 },
  credits_50: { credits: 50, price: 45 },
  credits_100: { credits: 100, price: 85 },
};

// Purchase credits by package
router.post('/purchase', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { packageId, credits, paymentToken } = req.body as { 
    packageId?: string; 
    credits?: number;
    paymentToken?: string;
  };

  // Support package-based purchases
  let creditsToAdd: number;
  let description: string;

  if (packageId && CREDIT_PACKAGES[packageId]) {
    const pkg = CREDIT_PACKAGES[packageId];
    creditsToAdd = pkg.credits;
    description = `Purchased ${pkg.credits} credits for $${pkg.price}`;
  } else if (credits && credits >= 1 && credits <= 1000) {
    // Legacy support for direct credit amounts
    creditsToAdd = credits;
    description = `Purchased ${credits} credits`;
  } else {
    res.status(400).json({ error: 'Invalid package or credit amount' });
    return;
  }

  // TODO: Integrate with Stripe/RevenueCat to verify payment
  // For development, we'll grant credits without payment verification
  // In production, validate paymentToken before proceeding

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.userId },
      data: { credits: { increment: creditsToAdd } },
      select: { credits: true, isSubscribed: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.user.userId,
        type: 'PURCHASE',
        amount: creditsToAdd,
        description,
      },
    }),
  ]);

  res.json({ 
    credits: user.credits, 
    purchased: creditsToAdd,
    isSubscribed: user.isSubscribed,
  });
});

// Subscribe user (placeholder - would integrate with payment provider)
router.post('/subscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // TODO: Integrate with Stripe/RevenueCat to handle subscription payment
  // For development, we'll just toggle the subscription flag
  // In production, this would:
  // 1. Create a Stripe subscription
  // 2. Store the subscription ID
  // 3. Set up webhook handlers for renewals/cancellations

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { isSubscribed: true },
    select: { credits: true, isSubscribed: true },
  });

  res.json({ 
    success: true,
    isSubscribed: user.isSubscribed,
    credits: user.credits,
    message: 'Subscription activated',
  });
});

// Cancel subscription (placeholder)
router.post('/unsubscribe', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // TODO: Integrate with Stripe to cancel subscription
  // In production, this would cancel at period end, not immediately

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { isSubscribed: false },
    select: { credits: true, isSubscribed: true },
  });

  res.json({ 
    success: true,
    isSubscribed: user.isSubscribed,
    credits: user.credits,
    message: 'Subscription cancelled',
  });
});

export default router;
