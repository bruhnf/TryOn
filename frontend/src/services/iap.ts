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
  // Cast: Android subscriptions need subscriptionOffers, which we don't ship yet.
  // App is iOS-only at submission time. Revisit when adding Android support.
  await IAP.requestPurchase({
    request: { ios: { sku, appAccountToken: userId } },
    type: 'subs',
  } as never);
}

export async function purchaseCreditPack(sku: string, userId: string): Promise<void> {
  await initIap();
  await IAP.requestPurchase({
    request: { ios: { sku, appAccountToken: userId } },
    type: 'inapp',
  } as never);
}

interface PurchaseLike {
  productId?: string;
  transactionId?: string;
  id?: string;
  // Field names vary by expo-iap version and platform — we try them in order.
  jwsRepresentationIos?: string;
  purchaseToken?: string;
  transactionReceipt?: string;
}

// Pull the JWS / receipt out of a purchase object regardless of which field
// name the installed expo-iap version uses.
function extractReceipt(purchase: PurchaseLike): string | null {
  return (
    purchase.jwsRepresentationIos ??
    purchase.purchaseToken ??
    purchase.transactionReceipt ??
    null
  );
}

/**
 * Send the signed receipt to our backend for verification, then mark the
 * StoreKit transaction as finished. Only finish AFTER the backend confirms
 * the entitlement was applied — finishing earlier would let the entitlement
 * silently fail if our DB write didn't land.
 *
 * If no JWS field is present on the purchase object (library version drift),
 * we log the available keys and skip verify-receipt. The webhook on the
 * backend is the safety net that grants entitlement either way; we still
 * finish the transaction so StoreKit doesn't keep retrying.
 */
export async function verifyAndFinish(purchase: PurchaseLike): Promise<{
  tier?: string;
  credits?: number;
  alreadyProcessed?: boolean;
  fastPathSkipped?: boolean;
}> {
  const jwsRepresentation = extractReceipt(purchase);

  let result: {
    tier?: string;
    credits?: number;
    alreadyProcessed?: boolean;
    fastPathSkipped?: boolean;
  } = {};

  if (jwsRepresentation) {
    try {
      const { data } = await api.post<{
        success?: boolean;
        alreadyProcessed?: boolean;
        tier?: string;
        credits?: number;
      }>('/credits/verify-receipt', { jwsRepresentation });
      result = data;
    } catch {
      // Backend verification failed — fall through to finishTransaction so
      // StoreKit doesn't retry forever. The webhook will reconcile state.
      result.fastPathSkipped = true;
    }
  } else {
    // Surface what fields ARE on the object so we can update the extractor.
    // eslint-disable-next-line no-console
    console.warn('[iap] Purchase missing JWS — fields available:', Object.keys(purchase));
    result.fastPathSkipped = true;
  }

  await IAP.finishTransaction({ purchase: purchase as never, isConsumable: undefined });
  return result;
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
