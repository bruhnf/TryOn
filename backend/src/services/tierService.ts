import { UserTier } from '@prisma/client';

export interface TierConfig {
  // Daily included try-on sessions; FREE has 0 (credits-only)
  dailyLimit: number;
  // Per-credit price in dollars for buying additional credits
  creditPrice: number;
}

export const TIER_CONFIG: Record<UserTier, TierConfig> = {
  FREE: { dailyLimit: 0, creditPrice: 0.6 },
  BASIC: { dailyLimit: 2, creditPrice: 0.5 },
  PREMIUM: { dailyLimit: 4, creditPrice: 0.25 },
};

export function getTierConfig(tier: UserTier): TierConfig {
  return TIER_CONFIG[tier];
}

// Free-credit policy: 10 credits granted ONCE at email verification
// (see authController.verifyEmail). There is no recurring grant — users
// who exhaust their initial credits must purchase more or subscribe.
