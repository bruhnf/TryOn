import { UserTier } from '@prisma/client';

// Maps an Apple StoreKit productId to the UserTier it grants on our side.
// Keep in sync with the products configured in App Store Connect.
//
// Pattern: com.evofaceflow.tryon.<tier>.<period>
export const PRODUCT_ID_TO_TIER: Record<string, UserTier> = {
  'com.evofaceflow.tryon.basic.monthly': 'BASIC',
  'com.evofaceflow.tryon.basic.yearly': 'BASIC',
  'com.evofaceflow.tryon.premium.monthly': 'PREMIUM',
  'com.evofaceflow.tryon.premium.yearly': 'PREMIUM',
};

export function tierForProductId(productId: string | undefined | null): UserTier | null {
  if (!productId) return null;
  return PRODUCT_ID_TO_TIER[productId] ?? null;
}
