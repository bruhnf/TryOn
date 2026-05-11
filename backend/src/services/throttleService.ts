/**
 * Soft per-user throttle for try-on submissions.
 *
 * Sits on top of the hard per-IP rate limit (5 POST/min) and the weekly /
 * credit gates. Where those refuse the request, this layer instead accepts
 * it and defers execution via BullMQ's `delay` option, so the client can
 * show a "starts in X:XX" countdown. The goal is to flatten the Grok API
 * cost curve for rapid-fire bursts without breaking the happy path for
 * normal usage.
 *
 * Tunables are exported constants so a future admin endpoint can read or
 * override them at runtime.
 */
import type { UserTier } from '@prisma/client';
import prisma from '../lib/prisma';

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Submissions allowed with zero delay within the window, per tier.
// Mild scaling: FREE base, BASIC +1, PREMIUM +2.
export const TIER_FREE_BURST: Record<UserTier, number> = {
  FREE: 3,
  BASIC: 4,
  PREMIUM: 5,
};

// Delay ladder applied once the burst is exhausted. Each subsequent
// submission inside the window steps further down the ladder; the last
// entry is the cap.
export const DELAY_LADDER_MS: readonly number[] = [
  60_000,   // 1 min
  180_000,  // 3 min
  300_000,  // 5 min
  600_000,  // 10 min — cap
] as const;

export interface ThrottleDecision {
  /** Milliseconds to defer the BullMQ job. 0 = run immediately. */
  delayMs: number;
  /**
   * 1-based position of this submission within the rolling window
   * (including itself). Useful for logging / future tuning.
   */
  ordinal: number;
  /** Free burst size that applied for this tier. */
  burst: number;
}

/**
 * Compute the throttle delay for the next submission a user is about to
 * make. Counts the user's non-FAILED submissions in the rolling window —
 * matching the same exclusion rule used by the weekly-limit query, since
 * a failed-and-refunded job didn't actually consume Grok cost.
 *
 * Must be called AFTER the credit/weekly gates pass and BEFORE the row is
 * created — the count it does is "submissions made before this one", so
 * `ordinal = count + 1`.
 */
export async function computeQueueDelayMs(
  userId: string,
  tier: UserTier,
): Promise<ThrottleDecision> {
  const since = new Date(Date.now() - THROTTLE_WINDOW_MS);
  const recent = await prisma.tryOnJob.count({
    where: { userId, createdAt: { gte: since }, status: { not: 'FAILED' } },
  });
  const ordinal = recent + 1;
  const burst = TIER_FREE_BURST[tier];
  if (ordinal <= burst) return { delayMs: 0, ordinal, burst };
  const idx = Math.min(ordinal - burst - 1, DELAY_LADDER_MS.length - 1);
  return { delayMs: DELAY_LADDER_MS[idx], ordinal, burst };
}
