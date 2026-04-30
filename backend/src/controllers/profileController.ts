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
      fullBodyUrl: true,
      mediumBodyUrl: true,
      isSubscribed: true,
      credits: true,
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
  res.json(user);
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
      isSubscribed: true,
      credits: true,
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
      isSubscribed: true,
      credits: true,
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
