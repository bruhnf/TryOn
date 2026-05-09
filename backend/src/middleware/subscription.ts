import { Request, Response, NextFunction } from 'express';
import { TIER_CONFIG } from '../services/tierService';

// Max clothing items per try-on (applies to all users)
export const MAX_CLOTHING_ITEMS = 1;

/**
 * Middleware to require an active tier with a weekly allowance OR available credits.
 */
export function requireSubscription() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const weeklyLimit = TIER_CONFIG[req.user.tier].weeklyLimit;
    if (weeklyLimit <= 0 && req.user.credits <= 0) {
      res.status(403).json({
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'Please subscribe or purchase credits to use try-on.',
      });
      return;
    }
    next();
  };
}
