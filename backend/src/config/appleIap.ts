import { UserTier } from '@prisma/client';

// Configuration for every Apple In-App Purchase product we sell.
// Keep in sync with the Product IDs configured in App Store Connect.

export type AppleProduct =
  | { type: 'subscription'; tier: UserTier }
  | { type: 'credits'; credits: number };

export const PRODUCTS: Record<string, AppleProduct> = {
  // Auto-renewing subscriptions
  'com.evofaceflow.tryon.app.basic.monthly': { type: 'subscription', tier: 'BASIC' },
  'com.evofaceflow.tryon.app.premium.monthly': { type: 'subscription', tier: 'PREMIUM' },

  // Consumable credit packs
  'com.evofaceflow.tryon.app.credits.10': { type: 'credits', credits: 10 },
  'com.evofaceflow.tryon.app.credits.25': { type: 'credits', credits: 25 },
  'com.evofaceflow.tryon.app.credits.50': { type: 'credits', credits: 50 },
  'com.evofaceflow.tryon.app.credits.100': { type: 'credits', credits: 100 },
};

export function getProduct(productId: string | undefined | null): AppleProduct | null {
  if (!productId) return null;
  return PRODUCTS[productId] ?? null;
}

// Backwards-compatible helper used by code that only cares about subscription tier.
export function tierForProductId(productId: string | undefined | null): UserTier | null {
  const product = getProduct(productId);
  return product?.type === 'subscription' ? product.tier : null;
}
