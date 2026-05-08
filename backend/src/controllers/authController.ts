import { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../services/emailService';
import { recordLoginLocation } from '../services/locationService';
import { logAuth, createChildLogger } from '../services/logger';
import { isAdminEmail } from '../utils/admin';

const log = createChildLogger('AuthController');

const signupSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signup(req: Request, res: Response): Promise<void> {
  const parse = signupSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const { firstName, lastName, username, email, password } = parse.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    logAuth('signup', {
      email,
      success: false,
      reason: existing.email === email ? 'email_exists' : 'username_exists',
      ip: req.ip,
    });
    res
      .status(409)
      .json({ error: existing.email === email ? 'Email already in use' : 'Username taken' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = uuidv4();
  const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: { firstName, lastName, username, email, passwordHash, verifyToken, verifyTokenExpiry },
  });

  await sendVerificationEmail(email, verifyToken);

  logAuth('signup', {
    userId: user.id,
    email,
    success: true,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    message: 'Account created. Check your email to verify your account.',
    userId: user.id,
  });
}

const SIGNUP_CREDIT_GRANT = 10;

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const user = await prisma.user.findFirst({ where: { verifyToken: token } });

  if (!user || (user.verifyTokenExpiry && user.verifyTokenExpiry < new Date())) {
    res.status(400).send('<h2>Invalid or expired verification link.</h2>');
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        verified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
        credits: { increment: SIGNUP_CREDIT_GRANT },
      },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: 'GRANT',
        amount: SIGNUP_CREDIT_GRANT,
        description: 'Welcome bonus — email verified',
      },
    }),
  ]);

  // Deep link back into the app
  res.redirect(`tryon://verified`);
}

export async function login(req: Request, res: Response): Promise<void> {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const { email, password } = parse.data;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '0.0.0.0';

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    logAuth('failed_login', {
      email,
      success: false,
      reason: 'invalid_credentials',
      ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.verified) {
    logAuth('failed_login', {
      email,
      userId: user.id,
      success: false,
      reason: 'email_not_verified',
      ip,
    });
    res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email before logging in.' });
    return;
  }

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    tier: user.tier,
    credits: user.credits,
  });
  const rawRefresh = signRefreshToken(user.id);
  const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId: user.id, token: rawRefresh, expiresAt: refreshExpiry },
  });

  // Record location in background - errors are logged by locationService
  recordLoginLocation(user.id, ip, 'login', user.email).catch((err) => {
    log.error('Failed to record login location', { userId: user.id, error: err.message });
  });

  logAuth('login', {
    userId: user.id,
    email,
    success: true,
    ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({
    accessToken,
    refreshToken: rawRefresh,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      tier: user.tier,
      credits: user.credits,
      tryOnCount: user.tryOnCount,
      verified: user.verified,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      fullBodyUrl: user.fullBodyUrl,
      mediumBodyUrl: user.mediumBodyUrl,
      followingCount: user.followingCount,
      followersCount: user.followersCount,
      likesCount: user.likesCount,
      isAdmin: isAdminEmail(user.email),
    },
  });
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body as { refreshToken?: string };
  if (!token) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  try {
    const { userId } = verifyRefreshToken(token);
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.userId !== userId || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      tier: user.tier,
      credits: user.credits,
    });

    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body as { refreshToken?: string };
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } }).catch(() => {});
  }
  res.json({ message: 'Logged out' });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond 200 to prevent email enumeration
  if (!user) {
    res.json({ message: 'If an account exists, a reset email has been sent.' });
    return;
  }

  const resetToken = uuidv4();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetToken,
      passwordResetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await sendPasswordResetEmail(email, resetToken);
  res.json({ message: 'If an account exists, a reset email has been sent.' });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.status(400).json({ error: 'token and password are required' });
    return;
  }

  const schema = z.string().min(8)
    .regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
  if (!schema.safeParse(password).success) {
    res.status(400).json({ error: 'Password does not meet requirements' });
    return;
  }

  const user = await prisma.user.findFirst({ where: { passwordResetToken: token } });
  if (!user || !user.passwordResetTokenExpiry || user.passwordResetTokenExpiry < new Date()) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetTokenExpiry: null },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  res.json({ message: 'Password updated successfully' });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.verified) {
    res.json({ message: 'If applicable, a verification email has been sent.' });
    return;
  }

  const verifyToken = uuidv4();
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyToken, verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  await sendVerificationEmail(email, verifyToken);
  res.json({ message: 'Verification email sent.' });
}
