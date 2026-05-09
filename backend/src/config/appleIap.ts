import { UserTier } from '@prisma/client';

// Configuration for every Apple In-App Purchase product we sell.
// Keep in sync with the Product IDs configured in App Store Connect.
//
// Credit packs: there are 4 sizes (10 / 25 / 50 / 100) and 3 tier variants
// per size (free / basic / premium), for a total of 12 consumable SKUs.
// Every variant of the same size grants the SAME number of credits — the
// tier suffix only affects the price set in App Store Connect (Free pays
// the most per credit, Premium the least). The mobile client is responsible
// for offering only the variant that matches the user's current tier.

export type AppleProduct =
  | { type: 'subscription'; tier: UserTier }
  | { type: 'credits'; credits: number; tierVariant: UserTier };

export const PRODUCTS: Record<string, AppleProduct> = {
  // Auto-renewing subscriptions
  'com.evofaceflow.tryon.app.basic.monthly': { type: 'subscription', tier: 'BASIC' },
  'com.evofaceflow.tryon.app.premium.monthly': { type: 'subscription', tier: 'PREMIUM' },

  // Consumable credit packs — Free-tier prices (most expensive)
  'com.evofaceflow.tryon.app.credits.10.free':  { type: 'credits', credits: 10,  tierVariant: 'FREE' },
  'com.evofaceflow.tryon.app.credits.25.free':  { type: 'credits', credits: 25,  tierVariant: 'FREE' },
  'com.evofaceflow.tryon.app.credits.50.free':  { type: 'credits', credits: 50,  tierVariant: 'FREE' },
  'com.evofaceflow.tryon.app.credits.100.free': { type: 'credits', credits: 100, tierVariant: 'FREE' },

  // Consumable credit packs — Basic-tier prices
  'com.evofaceflow.tryon.app.credits.10.basic':  { type: 'credits', credits: 10,  tierVariant: 'BASIC' },
  'com.evofaceflow.tryon.app.credits.25.basic':  { type: 'credits', credits: 25,  tierVariant: 'BASIC' },
  'com.evofaceflow.tryon.app.credits.50.basic':  { type: 'credits', credits: 50,  tierVariant: 'BASIC' },
  'com.evofaceflow.tryon.app.credits.100.basic': { type: 'credits', credits: 100, tierVariant: 'BASIC' },

  // Consumable credit packs — Premium-tier prices (cheapest)
  'com.evofaceflow.tryon.app.credits.10.premium':  { type: 'credits', credits: 10,  tierVariant: 'PREMIUM' },
  'com.evofaceflow.tryon.app.credits.25.premium':  { type: 'credits', credits: 25,  tierVariant: 'PREMIUM' },
  'com.evofaceflow.tryon.app.credits.50.premium':  { type: 'credits', credits: 50,  tierVariant: 'PREMIUM' },
  'com.evofaceflow.tryon.app.credits.100.premium': { type: 'credits', credits: 100, tierVariant: 'PREMIUM' },
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
