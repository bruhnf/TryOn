/**
 * StoreKit / In-App Purchase wrapper for TryOn.
 *
 * Wraps `expo-iap` so screens don't have to import the library directly. Centralizes:
 *   - Product ID catalog (subscriptions + credit packs)
 *   - Connection lifecycle (init / end)
 *   - Fetching products with localized prices from Apple
 *   - Initiating purchases with appAccountToken set to our user.id
 *   - Posting the signed receipt to our backend for verification
 *   - Finishing transactions only after the backend confirms
 *
 * Apple App Store Review Guideline 3.1.1: subscription and consumable
 * entitlements must be granted only via StoreKit. Hardcoded prices and
 * server-side "purchase" endpoints are disallowed.
 */
import * as IAP from 'expo-iap';
import Constants from 'expo-constants';
import api from '../config/api';

type AppleProductsConfig = {
  subscriptions: { basicMonthly: string; premiumMonthly: string };
  credits: { '10': string; '25': string; '50': string; '100': string };
};

const APPLE_PRODUCTS: AppleProductsConfig =
  (Constants.expoConfig?.extra as { appleProducts?: AppleProductsConfig })?.appleProducts ??
  ({} as AppleProductsConfig);

export const SUBSCRIPTION_SKUS = [
  APPLE_PRODUCTS.subscriptions?.basicMonthly,
  APPLE_PRODUCTS.subscriptions?.premiumMonthly,
].filter(Boolean) as string[];

export const CREDIT_PACK_SKUS = [
  APPLE_PRODUCTS.credits?.['10'],
  APPLE_PRODUCTS.credits?.['25'],
  APPLE_PRODUCTS.credits?.['50'],
  APPLE_PRODUCTS.credits?.['100'],
].filter(Boolean) as string[];

// Maps a credit-pack SKU to the number of credits it grants. Used only for
// display; the backend is the source of truth for credit grants.
export const CREDITS_FOR_SKU: Record<string, number> = {
  [APPLE_PRODUCTS.credits?.['10'] ?? '']: 10,
  [APPLE_PRODUCTS.credits?.['25'] ?? '']: 25,
  [APPLE_PRODUCTS.credits?.['50'] ?? '']: 50,
  [APPLE_PRODUCTS.credits?.['100'] ?? '']: 100,
};

export interface DisplayProduct {
  sku: string;
  displayPrice: string; // localized, e.g. "$9.99" or "€9,99"
  currency?: string;
  title?: string;
  description?: string;
}

let connectionInitialized = false;

export async function initIap(): Promise<void> {
  if (connectionInitialized) return;
  await IAP.initConnection();
  connectionInitialized = true;
}

export async function endIap(): Promise<void> {
  if (!connectionInitialized) return;
  try {
    await IAP.endConnection();
  } finally {
    connectionInitialized = false;
  }
}

function toDisplay(p: { id?: string; productId?: string; displayPrice?: string; price?: string; currency?: string; title?: string; description?: string }): DisplayProduct {
  return {
    sku: p.id ?? p.productId ?? '',
    displayPrice: p.displayPrice ?? p.price ?? '',
    currency: p.currency,
    title: p.title,
    description: p.description,
  };
}

export async function fetchProducts(): Promise<{
  subscriptions: DisplayProduct[];
  credits: DisplayProduct[];
}> {
  await initIap();
  const [subs, credits] = await Promise.all([
    IAP.requestProducts({ skus: SUBSCRIPTION_SKUS, type: 'subs' as const }),
    IAP.requestProducts({ skus: CREDIT_PACK_SKUS, type: 'inapp' as const }),
  ]);
  return {
    subscriptions: (subs as unknown as Array<Record<string, unknown>>).map((p) => toDisplay(p as never)),
    credits: (credits as unknown as Array<Record<string, unknown>>).map((p) => toDisplay(p as never)),
  };
}

/**
 * Initiate a StoreKit purchase. `userId` is set as `appAccountToken` so App
 * Store Server Notifications can be mapped back to the user on our side.
 *
 * StoreKit on iOS will surface the system purchase sheet. The result comes
 * back via the purchase listener (set up by callers); this function returns
 * once the request has been dispatched.
 */
export async function purchaseSubscription(sku: string, userId: string): Promise<void> {
  await initIap();
  await IAP.requestPurchase({
    request: {
      ios: { sku, appAccountToken: userId },
      android: { skus: [sku] },
    },
    type: 'subs',
  });
}

export async function purchaseCreditPack(sku: string, userId: string): Promise<void> {
  await initIap();
  await IAP.requestPurchase({
    request: {
      ios: { sku, appAccountToken: userId },
      android: { skus: [sku] },
    },
    type: 'inapp',
  });
}

interface PurchaseLike {
  productId: string;
  transactionId?: string;
  id?: string;
  jwsRepresentationIos?: string;
  transactionReceipt?: string;
}

/**
 * Send the signed receipt to our backend for verification, then mark the
 * StoreKit transaction as finished. Only finish AFTER the backend confirms
 * the entitlement was applied — finishing earlier would let the entitlement
 * silently fail if our DB write didn't land.
 */
export async function verifyAndFinish(purchase: PurchaseLike): Promise<{
  tier?: string;
  credits?: number;
  alreadyProcessed?: boolean;
}> {
  const jwsRepresentation = purchase.jwsRepresentationIos ?? purchase.transactionReceipt;
  if (!jwsRepresentation) throw new Error('Purchase missing JWS representation');

  const { data } = await api.post<{
    success?: boolean;
    alreadyProcessed?: boolean;
    tier?: string;
    credits?: number;
  }>('/credits/verify-receipt', { jwsRepresentation });

  // Only acknowledge to StoreKit after backend has applied entitlement.
  await IAP.finishTransaction({ purchase: purchase as never, isConsumable: undefined });
  return data;
}

/**
 * Restore previously-purchased subscriptions/credits. App Store Review
 * Guideline 3.1.1 requires that auto-renewing subscription apps expose this
 * flow. We re-verify each available purchase against our backend so the user
 * lands in the correct tier even on a fresh install.
 */
export async function restorePurchases(): Promise<{ restoredCount: number }> {
  await initIap();
  const purchases = (await IAP.getAvailablePurchases()) as unknown as PurchaseLike[];
  let restoredCount = 0;
  for (const purchase of purchases) {
    try {
      await verifyAndFinish(purchase);
      restoredCount += 1;
    } catch {
      // Continue restoring others even if one fails
    }
  }
  return { restoredCount };
}

/**
 * Open the iOS Manage Subscriptions screen. Required by App Store guidelines
 * for any app with auto-renewing subscriptions.
 */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
