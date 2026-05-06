import type { UserTier } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        tier: UserTier;
        credits: number;
      };
    }
  }
}

export {};
