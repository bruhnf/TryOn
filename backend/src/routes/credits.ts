import { Router, Request, Response } from 'express';
import { UserTier } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';
import { TIER_CONFIG, grantMonthlyFreeCreditsIfDue } from '../services/tierService';
import { verifyAndDecodeTransaction } from '../services/appleNotificationService';
import { getProduct } from '../config/appleIap';
import { env } from '../config/env';
import { createChildLogger } from '../services/logger';

const router = Router();
const log = createChildLogger('CreditsRoute');

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

// Verify a StoreKit purchase and apply the entitlement.
//
// Apple App Store Review Guideline 3.1.1 requires that subscription tier and
// consumable credits ONLY be granted in response to a verified StoreKit
// transaction. The mobile client posts the JWS-signed transaction it received
// from StoreKit; we verify against Apple's CA chain and apply tier/credits
// based on our PRODUCTS mapping.
//
// Idempotent: if the same transactionId is verified twice, the second call
// returns the current state without re-applying the entitlement (StoreKit
// retries on network failure are common).
router.post('/verify-receipt', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { jwsRepresentation } = req.body as { jwsRepresentation?: string };
  if (!jwsRepresentation || typeof jwsRepresentation !== 'string') {
    res.status(400).json({ error: 'jwsRepresentation required' });
    return;
  }

  let transaction;
  try {
    transaction = await verifyAndDecodeTransaction(jwsRepresentation);
  } catch (err) {
    log.warn('Receipt verification failed', {
      userId: req.user.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(400).json({ error: 'Receipt verification failed' });
    return;
  }

  if (!transaction.transactionId || !transaction.originalTransactionId || !transaction.productId) {
    res.status(400).json({ error: 'Verified transaction missing required fields' });
    return;
  }

  // The client must have set appAccountToken = our user.id at purchase time.
  // If that's missing or doesn't match the authenticated user, refuse: prevents
  // a malicious user from posting someone else's receipt to claim entitlement.
  if (!transaction.appAccountToken || transaction.appAccountToken !== req.user.userId) {
    log.warn('Receipt appAccountToken does not match authenticated user', {
      userId: req.user.userId,
      appAccountToken: transaction.appAccountToken,
      transactionId: transaction.transactionId,
    });
    res.status(403).json({ error: 'Receipt does not belong to this account' });
    return;
  }

  const product = getProduct(transaction.productId);
  if (!product) {
    log.warn('Receipt product not in catalog', {
      productId: transaction.productId,
      transactionId: transaction.transactionId,
    });
    res.status(400).json({ error: 'Unknown product' });
    return;
  }

  // Idempotency: if we've already processed this transactionId, return current state.
  const existing = await prisma.applePurchase.findUnique({
    where: { transactionId: transaction.transactionId },
  });
  if (existing) {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { credits: true, tier: true },
    });
    res.json({
      alreadyProcessed: true,
      tier: user?.tier,
      credits: user?.credits,
      productId: transaction.productId,
    });
    return;
  }

  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;

  if (product.type === 'subscription') {
    await prisma.$transaction([
      prisma.applePurchase.create({
        data: {
          userId: req.user.userId,
          transactionId: transaction.transactionId,
          originalTransactionId: transaction.originalTransactionId,
          productId: transaction.productId,
          tier: product.tier,
          expiresAt,
          rawReceipt: jwsRepresentation,
        },
      }),
      prisma.user.update({
        where: { id: req.user.userId },
        data: { tier: product.tier },
      }),
    ]);
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { credits: true, tier: true },
    });
    res.json({
      success: true,
      tier: user?.tier,
      credits: user?.credits,
      productId: transaction.productId,
      expiresAt,
    });
    return;
  }

  // Consumable credit pack
  await prisma.$transaction([
    prisma.applePurchase.create({
      data: {
        userId: req.user.userId,
        transactionId: transaction.transactionId,
        originalTransactionId: transaction.originalTransactionId,
        productId: transaction.productId,
        tier: 'FREE',
        expiresAt: null,
        rawReceipt: jwsRepresentation,
      },
    }),
    prisma.user.update({
      where: { id: req.user.userId },
      data: { credits: { increment: product.credits } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.user.userId,
        type: 'PURCHASE',
        amount: product.credits,
        description: `Apple IAP: ${transaction.productId} (+${product.credits} credits)`,
      },
    }),
  ]);
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { credits: true, tier: true },
  });
  res.json({
    success: true,
    tier: user?.tier,
    credits: user?.credits,
    productId: transaction.productId,
    creditsGranted: product.credits,
  });
});

// Legacy unsafe endpoints. Granting tier or credits without an Apple receipt
// violates App Store Review Guideline 3.1.1. Disabled in production; kept
// available in dev to support local testing without StoreKit.
router.post('/purchase', async (req: Request, res: Response) => {
  if (!env.isDev) {
    res.status(410).json({
      error:
        'This endpoint is disabled. Use StoreKit + /api/credits/verify-receipt for credit purchases.',
    });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { credits } = req.body as { credits?: number };
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

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.userId },
      data: { credits: { increment: credits } },
      select: { credits: true, tier: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.user.userId,
        type: 'GRANT',
        amount: credits,
        description: `[DEV] Granted ${credits} credits (no payment validated)`,
      },
    }),
  ]);

  res.json({ credits: user.credits, purchased: credits, pricePerCredit, totalPrice, tier: user.tier });
});

router.post('/subscribe', async (req: Request, res: Response) => {
  if (!env.isDev) {
    res.status(410).json({
      error:
        'This endpoint is disabled. Use StoreKit + /api/credits/verify-receipt for subscriptions.',
    });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { tier } = req.body as { tier?: UserTier };
  if (!tier || !['FREE', 'BASIC', 'PREMIUM'].includes(tier)) {
    res.status(400).json({ error: 'tier must be FREE, BASIC, or PREMIUM' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { tier },
    select: { credits: true, tier: true },
  });

  res.json({ success: true, tier: user.tier, credits: user.credits, message: `[DEV] Tier set to ${user.tier}` });
});

// Restore Apple In-App Purchases for the authenticated user.
//
// Apple App Store Review Guideline 3.1.1 requires apps with auto-renewing
// subscriptions to expose a "Restore Purchases" affordance. This endpoint
// re-reads the user's prior `ApplePurchase` records and re-applies the
// most recent unexpired, non-revoked entitlement to their User.tier.
//
// In a fully wired implementation the client would post the latest StoreKit
// receipt / JWS here and we would verify it against Apple's servers before
// upserting an `ApplePurchase` row. For now we restore based on records we
// already have on file (e.g. previously verified via App Store Server
// Notifications V2).
router.post('/restore-purchases', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const now = new Date();

  const activePurchase = await prisma.applePurchase.findFirst({
    where: {
      userId: req.user.userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
  });

  if (!activePurchase) {
    res.json({
      restored: false,
      message: 'No active purchases were found for this account.',
    });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { tier: activePurchase.tier },
    select: { tier: true, credits: true },
  });

  res.json({
    restored: true,
    tier: user.tier,
    expiresAt: activePurchase.expiresAt,
    productId: activePurchase.productId,
    originalTransactionId: activePurchase.originalTransactionId,
    credits: user.credits,
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
