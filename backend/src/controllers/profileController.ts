import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const updateSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  bio: z.string().max(200).optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
});

export async function getProfile(req: Request, res: Response): Promise<void> {
  const { username } = req.params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      bio: true,
      avatarUrl: true,
      // Body photos intentionally omitted from public profile responses
      tryOnCount: true,
      followingCount: true,
      followersCount: true,
      likesCount: true,
      createdAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Public, completed try-on sessions (private sessions are omitted)
  const jobs = await prisma.tryOnJob.findMany({
    where: { userId: user.id, status: 'COMPLETE', isPrivate: false },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      resultFullBodyUrl: true,
      resultMediumUrl: true,
      likesCount: true,
      createdAt: true,
    },
  });

  // If the request is authenticated, surface whether the viewer follows this user
  let isFollowing = false;
  let isSelf = false;
  if (req.user) {
    isSelf = req.user.userId === user.id;
    if (!isSelf) {
      const f = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: req.user.userId, followingId: user.id } },
      });
      isFollowing = !!f;
    }
  }

  res.json({ ...user, jobs, isFollowing, isSelf });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }

  const { username, ...rest } = parse.data;

  if (username) {
    const conflict = await prisma.user.findFirst({
      where: { username, NOT: { id: req.user.userId } },
    });
    if (conflict) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.user.userId },
    data: { ...(username ? { username } : {}), ...rest },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      bio: true,
      avatarUrl: true,
      fullBodyUrl: true,
      mediumBodyUrl: true,
      tier: true,
      credits: true,
      tryOnCount: true,
      followingCount: true,
      followersCount: true,
      city: true,
      state: true,
    },
  });

  res.json(updated);
}

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      bio: true,
      avatarUrl: true,
      fullBodyUrl: true,
      mediumBodyUrl: true,
      tier: true,
      credits: true,
      tryOnCount: true,
      followingCount: true,
      followersCount: true,
      likesCount: true,
      city: true,
      state: true,
      createdAt: true,
    },
  });

  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  await prisma.user.delete({ where: { id: req.user.userId } });
  res.json({ message: 'Account deleted' });
}

// Export the authenticated user's personal data (GDPR / CCPA right of access).
// Returns a JSON document the client can save or share. Sensitive fields like
// the password hash and refresh tokens are intentionally omitted.
export async function exportData(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const userId = req.user.userId;

  const [user, tryOnJobs, locations, follows, followers, creditTransactions, applePurchases, likes, notifications] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, username: true, email: true, verified: true, tier: true, credits: true,
          tryOnCount: true, lastFreeCreditGrantAt: true, firstName: true, lastName: true,
          bio: true, avatarUrl: true, fullBodyUrl: true, mediumBodyUrl: true,
          followingCount: true, followersCount: true, likesCount: true,
          address: true, city: true, state: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.tryOnJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, isPrivate: true, clothingPhoto1Url: true, clothingPhoto2Url: true,
          resultFullBodyUrl: true, resultMediumUrl: true, bodyPhotoUrl: true,
          perspectivesUsed: true, likesCount: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.userLocation.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.follow.findMany({ where: { followerId: userId } }),
      prisma.follow.findMany({ where: { followingId: userId } }),
      prisma.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.applePurchase.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, transactionId: true, originalTransactionId: true, productId: true,
          tier: true, expiresAt: true, revokedAt: true, createdAt: true, updatedAt: true,
          // rawReceipt intentionally omitted — large and not user-meaningful
        },
      }),
      prisma.like.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);

  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user,
    tryOnJobs,
    locations,
    follows: { following: follows, followers },
    creditTransactions,
    applePurchases,
    likes,
    notifications,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="tryon-export-${user.username}-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  res.json(exportPayload);
}
