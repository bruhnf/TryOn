import { SubscriptionLevel } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        subscriptionLevel: SubscriptionLevel;
      };
    }
  }
}

export {};
