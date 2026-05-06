import { UserTier } from '@prisma/client';
import prisma from '../lib/prisma';

export interface TierConfig {
  // Daily included try-on sessions; FREE has 0 (credits-only)
  dailyLimit: number;
  // Per-credit price in dollars for buying additional credits
  creditPrice: number;
  // Credits granted at the start of each calendar month (FREE only)
  monthlyFreeCredits: number;
}

export const TIER_CONFIG: Record<UserTier, TierConfig> = {
  FREE: { dailyLimit: 0, creditPrice: 0.5, monthlyFreeCredits: 10 },
  BASIC: { dailyLimit: 4, creditPrice: 0.4, monthlyFreeCredits: 0 },
  PREMIUM: { dailyLimit: 6, creditPrice: 0.3, monthlyFreeCredits: 0 },
};

export function getTierConfig(tier: UserTier): TierConfig {
  return TIER_CONFIG[tier];
}

/**
 * Returns true if `last` is in a different calendar month/year than `now`,
 * or if `last` is null (never granted).
 */
export function isNewMonth(last: Date | null, now: Date = new Date()): boolean {
  if (!last) return true;
  return last.getUTCFullYear() !== now.getUTCFullYear() || last.getUTCMonth() !== now.getUTCMonth();
}

/**
 * Lazy monthly credit grant for FREE-tier users. Idempotent within a calendar month.
 * Returns the (possibly updated) credit balance and lastFreeCreditGrantAt.
 */
export async function grantMonthlyFreeCreditsIfDue(userId: string): Promise<{
  credits: number;
  granted: number;
  tier: UserTier;
  lastFreeCreditGrantAt: Date | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, credits: true, lastFreeCreditGrantAt: true },
  });
  if (!user) throw new Error('User not found');

  if (user.tier !== 'FREE') {
    return { credits: user.credits, granted: 0, tier: user.tier, lastFreeCreditGrantAt: user.lastFreeCreditGrantAt };
  }

  if (!isNewMonth(user.lastFreeCreditGrantAt)) {
    return { credits: user.credits, granted: 0, tier: user.tier, lastFreeCreditGrantAt: user.lastFreeCreditGrantAt };
  }

  const grantAmount = TIER_CONFIG.FREE.monthlyFreeCredits;
  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        credits: { increment: grantAmount },
        lastFreeCreditGrantAt: now,
      },
      select: { credits: true, tier: true, lastFreeCreditGrantAt: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        type: 'GRANT',
        amount: grantAmount,
        description: 'Monthly free credits (FREE tier)',
      },
    }),
  ]);

  return { credits: updated.credits, granted: grantAmount, tier: updated.tier, lastFreeCreditGrantAt: updated.lastFreeCreditGrantAt };
}
