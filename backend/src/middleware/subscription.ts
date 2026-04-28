import { Request, Response, NextFunction } from 'express';
import { SubscriptionLevel } from '@prisma/client';

const levelOrder: Record<SubscriptionLevel, number> = {
  BASIC: 0,
  PRO: 1,
  PREMIUM: 2,
};

export function requireSubscription(minimum: SubscriptionLevel) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (levelOrder[req.user.subscriptionLevel] < levelOrder[minimum]) {
      res.status(403).json({
        error: 'Subscription upgrade required',
        required: minimum,
        current: req.user.subscriptionLevel,
      });
      return;
    }
    next();
  };
}

export const DAILY_TRYON_LIMITS: Record<SubscriptionLevel, number> = {
  BASIC: 5,
  PRO: 25,
  PREMIUM: Infinity,
};

export const CLOTHING_ITEM_LIMITS: Record<SubscriptionLevel, number> = {
  BASIC: 1,
  PRO: 2,
  PREMIUM: 2,
};
