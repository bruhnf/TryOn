import { Request, Response, NextFunction } from 'express';

// Daily limit for subscribers (non-subscribers cannot generate)
export const DAILY_TRYON_LIMIT = 15;

// Max clothing items per try-on (applies to all users)
export const MAX_CLOTHING_ITEMS = 1;

/**
 * Middleware to require an active subscription
 */
export function requireSubscription() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!req.user.isSubscribed && req.user.credits <= 0) {
      res.status(403).json({
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'Please subscribe or purchase credits to use try-on.',
      });
      return;
    }
    next();
  };
}
