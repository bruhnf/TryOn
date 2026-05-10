import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';
import { presignAvatarOnly } from '../services/imageUrlService';
import { createChildLogger } from '../services/logger';

const router = Router();
const log = createChildLogger('Comments');

router.use(requireAuth);

const createSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(500, 'Comment is too long'),
});

// List comments for a TryOn (paginated, oldest-first so the thread reads
// chronologically from top to bottom).
router.get('/tryon/:jobId/comments', async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobId } = req.params;
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const limit = Math.min(50, parseInt((req.query.limit as string) ?? '30', 10));

  const job = await prisma.tryOnJob.findUnique({
    where: { id: jobId },
    select: { id: true, isPrivate: true, userId: true },
  });
  if (!job) { res.status(404).json({ error: 'Try-on not found' }); return; }
  // Private TryOns: only the owner can see comments.
  if (job.isPrivate && job.userId !== req.user.userId) {
    res.status(404).json({ error: 'Try-on not found' });
    return;
  }

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    }),
    prisma.comment.count({ where: { jobId } }),
  ]);

  // Presign avatar URLs on each comment author.
  const presigned = await Promise.all(
    comments.map(async (c) => ({
      ...c,
      user: await presignAvatarOnly(c.user),
    })),
  );

  res.json({ comments: presigned, page, total, hasMore: page * limit < total });
});

// Create a comment on a TryOn. Self-comments are allowed and don't trigger
// a notification. Self-commenting on private TryOns is allowed; commenting
// on someone else's private TryOn is not (the GET above already hides them).
router.post('/tryon/:jobId/comments', async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { jobId } = req.params;
  const job = await prisma.tryOnJob.findUnique({
    where: { id: jobId },
    select: { id: true, userId: true, isPrivate: true },
  });
  if (!job) { res.status(404).json({ error: 'Try-on not found' }); return; }
  if (job.isPrivate && job.userId !== req.user.userId) {
    res.status(403).json({ error: 'This try-on is private' });
    return;
  }

  const isSelfComment = job.userId === req.user.userId;

  // Atomically: create the comment, bump the denormalized count, and (if
  // not a self-comment) create the in-app notification for the post owner.
  const ops = [
    prisma.comment.create({
      data: {
        jobId,
        userId: req.user.userId,
        body: parsed.data.body,
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    }),
    prisma.tryOnJob.update({
      where: { id: jobId },
      data: { commentsCount: { increment: 1 } },
    }),
  ];
  if (!isSelfComment) {
    ops.push(
      prisma.notification.create({
        data: {
          userId: job.userId,
          actorId: req.user.userId,
          type: 'COMMENT',
          jobId,
        },
      }) as never,
    );
  }
  const [comment] = await prisma.$transaction(ops);

  log.info('Comment created', {
    commentId: (comment as { id: string }).id,
    jobId,
    authorId: req.user.userId,
    isSelfComment,
  });

  const created = comment as typeof comment & { user: Parameters<typeof presignAvatarOnly>[0] };
  res.status(201).json({
    ...created,
    user: await presignAvatarOnly(created.user),
  });
});

// Delete a comment. Allowed if the caller is the comment author OR the owner
// of the TryOn the comment is on.
router.delete('/comments/:commentId', async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { commentId } = req.params;
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, jobId: true, job: { select: { userId: true } } },
  });
  if (!comment) { res.status(404).json({ error: 'Comment not found' }); return; }

  const isAuthor = comment.userId === req.user.userId;
  const isPostOwner = comment.job.userId === req.user.userId;
  if (!isAuthor && !isPostOwner) {
    res.status(403).json({ error: 'Not allowed to delete this comment' });
    return;
  }

  await prisma.$transaction([
    prisma.comment.delete({ where: { id: commentId } }),
    prisma.tryOnJob.update({
      where: { id: comment.jobId },
      data: { commentsCount: { decrement: 1 } },
    }),
  ]);

  log.info('Comment deleted', {
    commentId,
    deletedBy: req.user.userId,
    asAuthor: isAuthor,
    asPostOwner: isPostOwner,
  });

  res.json({ deleted: true });
});

export default router;
