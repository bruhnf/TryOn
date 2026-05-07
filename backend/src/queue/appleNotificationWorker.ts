import { Worker } from 'bullmq';
import { UserTier } from '@prisma/client';
import {
  NotificationTypeV2,
  Subtype,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
} from '@apple/app-store-server-library';
import { connection } from './tryonQueue';
import { AppleNotificationJobData } from './appleNotificationQueue';
import {
  verifyAndDecodeNotification,
  verifyAndDecodeRenewalInfo,
  verifyAndDecodeTransaction,
} from '../services/appleNotificationService';
import { tierForProductId } from '../config/appleIap';
import prisma from '../lib/prisma';
import { createChildLogger } from '../services/logger';

const log = createChildLogger('AppleNotificationWorker');

interface ResolvedTxn {
  userId: string | null;
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload | null;
}

// Resolve our internal userId from the StoreKit transaction.
// Preferred: appAccountToken (set on the client at purchase time = our User.id).
// Fallback:  match originalTransactionId against an existing ApplePurchase row.
async function resolveUserId(transaction: JWSTransactionDecodedPayload): Promise<string | null> {
  if (transaction.appAccountToken) {
    const user = await prisma.user.findUnique({
      where: { id: transaction.appAccountToken },
      select: { id: true },
    });
    if (user) return user.id;
    log.warn('appAccountToken did not match any user', {
      appAccountToken: transaction.appAccountToken,
      originalTransactionId: transaction.originalTransactionId,
    });
  }
  if (transaction.originalTransactionId) {
    const existing = await prisma.applePurchase.findFirst({
      where: { originalTransactionId: transaction.originalTransactionId },
      select: { userId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing.userId;
  }
  return null;
}

async function decodeNotificationPayload(signedPayload: string): Promise<ResolvedTxn | null> {
  const decoded = await verifyAndDecodeNotification(signedPayload);
  const data = decoded.data;
  if (!data?.signedTransactionInfo) {
    log.debug('Notification has no signedTransactionInfo', {
      notificationType: decoded.notificationType,
    });
    return null;
  }
  const transaction = await verifyAndDecodeTransaction(data.signedTransactionInfo);
  const renewal = data.signedRenewalInfo
    ? await verifyAndDecodeRenewalInfo(data.signedRenewalInfo)
    : null;
  const userId = await resolveUserId(transaction);
  return { userId, transaction, renewal };
}

async function upsertApplePurchase(
  userId: string,
  transaction: JWSTransactionDecodedPayload,
  rawSignedPayload: string,
  tier: UserTier,
  revoked = false,
): Promise<void> {
  if (!transaction.transactionId || !transaction.originalTransactionId || !transaction.productId) {
    log.warn('Skipping purchase upsert — missing required transaction fields', {
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      productId: transaction.productId,
    });
    return;
  }
  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  await prisma.applePurchase.upsert({
    where: { transactionId: transaction.transactionId },
    create: {
      userId,
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      productId: transaction.productId,
      tier,
      expiresAt,
      rawReceipt: rawSignedPayload,
      revokedAt: revoked ? new Date() : null,
    },
    update: {
      tier,
      productId: transaction.productId,
      expiresAt,
      rawReceipt: rawSignedPayload,
      revokedAt: revoked ? new Date() : null,
    },
  });
}

async function setUserTier(userId: string, tier: UserTier): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { tier } });
}

// Drop the user back to FREE only if they have no other active, unexpired,
// non-revoked entitlement on file. Prevents demoting a user who has overlapping
// subscriptions (e.g. a refunded purchase while a separate renewal is active).
async function downgradeIfNoActiveEntitlement(userId: string): Promise<void> {
  const now = new Date();
  const stillActive = await prisma.applePurchase.findFirst({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (stillActive) {
    await setUserTier(userId, stillActive.tier);
  } else {
    await setUserTier(userId, 'FREE');
  }
}

async function handleNotification(
  notificationType: NotificationTypeV2 | string,
  subtype: Subtype | string | undefined,
  signedPayload: string,
): Promise<void> {
  const resolved = await decodeNotificationPayload(signedPayload);
  if (!resolved) return;
  const { userId, transaction } = resolved;
  if (!userId) {
    log.warn('Could not resolve user for Apple notification', {
      notificationType,
      subtype,
      originalTransactionId: transaction.originalTransactionId,
      productId: transaction.productId,
    });
    return;
  }

  const tier = tierForProductId(transaction.productId);
  if (!tier) {
    log.warn('Unknown productId — no tier mapping configured', {
      productId: transaction.productId,
      notificationType,
    });
    return;
  }

  switch (notificationType) {
    // New subscription, resub, or auto-renewal succeeded.
    case NotificationTypeV2.SUBSCRIBED:
    case NotificationTypeV2.DID_RENEW:
    case NotificationTypeV2.OFFER_REDEEMED:
      await upsertApplePurchase(userId, transaction, signedPayload, tier);
      await setUserTier(userId, tier);
      break;

    // Billing recovery succeeded after a failed renewal — same as a renew.
    case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
      // User toggled auto-renew on/off. Informational; entitlement unchanged
      // until EXPIRED actually fires.
      await upsertApplePurchase(userId, transaction, signedPayload, tier);
      break;

    case NotificationTypeV2.DID_CHANGE_RENEWAL_PREF:
      // User scheduled a product change (upgrade/downgrade) for next period.
      // Current entitlement unchanged; persist the txn for audit.
      await upsertApplePurchase(userId, transaction, signedPayload, tier);
      break;

    case NotificationTypeV2.DID_FAIL_TO_RENEW:
      // Billing issue. If subtype is GRACE_PERIOD, entitlement is preserved.
      // Otherwise the sub will expire; await EXPIRED before downgrading.
      await upsertApplePurchase(userId, transaction, signedPayload, tier);
      break;

    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
    case NotificationTypeV2.EXPIRED:
      await upsertApplePurchase(userId, transaction, signedPayload, tier, /*revoked*/ true);
      await downgradeIfNoActiveEntitlement(userId);
      break;

    case NotificationTypeV2.REFUND:
    case NotificationTypeV2.REVOKE:
      await upsertApplePurchase(userId, transaction, signedPayload, tier, /*revoked*/ true);
      await downgradeIfNoActiveEntitlement(userId);
      break;

    case NotificationTypeV2.REFUND_DECLINED:
    case NotificationTypeV2.REFUND_REVERSED:
      // Refund did not actually go through, or was reversed. Restore the row.
      await upsertApplePurchase(userId, transaction, signedPayload, tier, /*revoked*/ false);
      await setUserTier(userId, tier);
      break;

    case NotificationTypeV2.RENEWAL_EXTENDED:
    case NotificationTypeV2.RENEWAL_EXTENSION:
      // Apple extended the subscription expiry — persist the new expiresDate.
      await upsertApplePurchase(userId, transaction, signedPayload, tier);
      await setUserTier(userId, tier);
      break;

    case NotificationTypeV2.PRICE_INCREASE:
      // Informational; user must opt in via App Store. No state change here.
      break;

    case NotificationTypeV2.CONSUMPTION_REQUEST:
      // Apple requesting consumption data for a refund decision. Replying via
      // App Store Server API SendConsumptionInformation is out of scope here.
      log.info('Apple CONSUMPTION_REQUEST received — manual response required', {
        userId,
        originalTransactionId: transaction.originalTransactionId,
      });
      break;

    case NotificationTypeV2.TEST:
      log.info('Apple TEST notification received', { userId });
      break;

    default:
      log.info('Unhandled Apple notification type', { notificationType, subtype, userId });
  }
}

const worker = new Worker<AppleNotificationJobData>(
  'apple-notifications',
  async (job) => {
    const { signedPayload, notificationUUID } = job.data;
    const decoded = await verifyAndDecodeNotification(signedPayload);
    log.info('Processing Apple notification', {
      notificationUUID,
      notificationType: decoded.notificationType,
      subtype: decoded.subtype,
      environment: decoded.data?.environment,
    });
    if (!decoded.notificationType) {
      log.warn('Apple notification missing notificationType — skipping', { notificationUUID });
      return;
    }
    await handleNotification(decoded.notificationType, decoded.subtype, signedPayload);
  },
  { connection, concurrency: 4 },
);

worker.on('failed', (job, err) => {
  log.error('Apple notification job failed', {
    notificationUUID: job?.data?.notificationUUID,
    attempt: job?.attemptsMade,
    error: err.message,
    stack: err.stack,
  });
});

export default worker;
