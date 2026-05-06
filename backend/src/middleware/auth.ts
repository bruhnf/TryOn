import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserTier } from '@prisma/client';

interface AccessTokenPayload {
  userId: string;
  email: string;
  tier: UserTier;
  credits: number;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Populates req.user if a valid Bearer token is present, but does not block requests
 * that are missing or have an invalid token. Use for routes that vary their response
 * based on whether a viewer is signed in (e.g., public profile shows isFollowing).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    req.user = payload;
  } catch {
    // Ignore — proceed without auth
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-admin-key'];
  if (key !== env.adminApiKey) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn } as SignOptions);
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
}
