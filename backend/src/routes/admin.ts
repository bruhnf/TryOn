import { Router, Request, Response } from 'express';
import { JobStatus, Prisma, ReportStatus } from '@prisma/client';
import { requireAdmin } from '../middleware/auth';
import prisma from '../lib/prisma';
import { hashPassword } from '../utils/password';
import { 
  getLatestReportSummary, 
  runAllScans,
} from '../services/vulnerabilityService';
import { triggerImmediateScan } from '../queue/vulnerabilityWorker';
import {
  presignUserPhotos,
  presignTryOnJob,
  presignTryOnJobs,
  presignAvatarOnly,
} from '../services/imageUrlService';

const router = Router();

router.use(requireAdmin);

router.get('/users', async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      verified: true,
      tier: true,
      credits: true,
      tryOnCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(users);
});

// Create test user
router.post('/users', async (req: Request, res: Response) => {
  const { firstName, lastName, username, email, password } = req.body as { 
    firstName?: string; 
    lastName?: string; 
    username?: string; 
    email?: string; 
    password?: string;
  };
  
  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, and password are required' });
    return;
  }
  
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    res.status(409).json({ error: existing.email === email ? 'Email already in use' : 'Username taken' });
    return;
  }
  
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { firstName, lastName, username, email, passwordHash, verified: true },
    select: { id: true, username: true, email: true, verified: true, credits: true },
  });
  
  res.status(201).json(user);
});

// Get single user with locations
router.get('/user/:userId', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: {
      id: true,
      username: true,
      email: true,
      verified: true,
      tier: true,
      credits: true,
      tryOnCount: true,
      firstName: true,
      lastName: true,
      bio: true,
      avatarUrl: true,
      fullBodyUrl: true,
      mediumBodyUrl: true,
      followingCount: true,
      followersCount: true,
      likesCount: true,
      address: true,
      city: true,
      state: true,
      createdAt: true,
      updatedAt: true,
      locations: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
    },
  });
  
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(await presignUserPhotos(user));
});

router.get('/jobs', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(1, parseInt(req.query.limit as string ?? '25', 10)), 100);
  const skip = Math.max(0, parseInt(req.query.skip as string ?? '0', 10));
  const search = ((req.query.search as string) ?? '').trim();
  const statusParam = req.query.status as string | undefined;

  const where: Prisma.TryOnJobWhereInput = {};
  if (statusParam && ['PENDING', 'PROCESSING', 'COMPLETE', 'FAILED'].includes(statusParam)) {
    where.status = statusParam as JobStatus;
  }
  if (search) {
    where.OR = [
      { user: { username: { contains: search, mode: 'insensitive' } } },
      { id: { startsWith: search } },
    ];
  }

  const [jobs, total] = await Promise.all([
    prisma.tryOnJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: { username: true } } },
    }),
    prisma.tryOnJob.count({ where }),
  ]);

  res.json({ jobs: await presignTryOnJobs(jobs), total });
});

router.delete('/user/:userId', async (req: Request, res: Response) => {
  await prisma.user.delete({ where: { id: req.params.userId } });
  res.json({ message: 'User deleted' });
});

router.patch('/user/:userId/verify', async (req: Request, res: Response) => {
  const { verified } = req.body as { verified?: boolean };
  if (typeof verified !== 'boolean') {
    res.status(400).json({ error: 'verified must be a boolean' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { verified },
    select: { id: true, username: true, email: true, verified: true },
  });
  res.json(user);
});

router.patch('/user/:userId/subscription', async (req: Request, res: Response) => {
  const { tier } = req.body as { tier?: 'FREE' | 'BASIC' | 'PREMIUM' };
  if (!tier || !['FREE', 'BASIC', 'PREMIUM'].includes(tier)) {
    res.status(400).json({ error: 'tier must be FREE, BASIC, or PREMIUM' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { tier },
    select: { id: true, username: true, email: true, tier: true, credits: true },
  });
  res.json(user);
});

router.patch('/user/:userId/credits', async (req: Request, res: Response) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  if (typeof amount !== 'number' || amount === 0) {
    res.status(400).json({ error: 'amount must be a non-zero number' });
    return;
  }
  
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.params.userId },
      data: { credits: { increment: amount } },
      select: { id: true, username: true, email: true, credits: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: req.params.userId,
        type: amount > 0 ? 'GRANT' : 'USAGE',
        amount,
        description: reason || (amount > 0 ? 'Admin credit grant' : 'Admin credit deduction'),
      },
    }),
  ]);
  
  res.json(user);
});

router.get('/stats', async (_req: Request, res: Response) => {
  const [userCount, jobCount, completedJobs, basicCount, premiumCount, totalCredits] = await Promise.all([
    prisma.user.count(),
    prisma.tryOnJob.count(),
    prisma.tryOnJob.count({ where: { status: 'COMPLETE' } }),
    prisma.user.count({ where: { tier: 'BASIC' } }),
    prisma.user.count({ where: { tier: 'PREMIUM' } }),
    prisma.user.aggregate({ _sum: { credits: true } }),
  ]);
  res.json({
    userCount,
    jobCount,
    completedJobs,
    subscriberCount: basicCount + premiumCount,
    basicCount,
    premiumCount,
    totalCreditsOutstanding: totalCredits._sum.credits || 0,
  });
});

// Security stats
router.get('/security/stats', async (_req: Request, res: Response) => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const [last24Hours, last7Days, total, uniqueUsers] = await Promise.all([
    prisma.userLocation.count({
      where: { suspiciousLocation: true, timestamp: { gte: oneDayAgo } },
    }),
    prisma.userLocation.count({
      where: { suspiciousLocation: true, timestamp: { gte: sevenDaysAgo } },
    }),
    prisma.userLocation.count({
      where: { suspiciousLocation: true },
    }),
    prisma.userLocation.groupBy({
      by: ['userId'],
      where: { suspiciousLocation: true },
    }).then(groups => groups.length),
  ]);
  
  res.json({ last24Hours, last7Days, total, uniqueUsers });
});

// Suspicious logins list
router.get('/security/suspicious', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  
  const locations = await prisma.userLocation.findMany({
    where: { suspiciousLocation: true },
    orderBy: { timestamp: 'desc' },
    take: limit,
    include: {
      user: {
        select: { username: true, email: true },
      },
    },
  });
  
  res.json(locations);
});

// Delete a single job
router.delete('/job/:jobId', async (req: Request, res: Response) => {
  try {
    await prisma.tryOnJob.delete({ where: { id: req.params.jobId } });
    res.json({ message: 'Job deleted' });
  } catch (error) {
    res.status(404).json({ error: 'Job not found' });
  }
});

// Bulk delete jobs
router.post('/jobs/delete', async (req: Request, res: Response) => {
  const { jobIds } = req.body as { jobIds?: string[] };
  
  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    res.status(400).json({ error: 'jobIds array is required' });
    return;
  }
  
  const result = await prisma.tryOnJob.deleteMany({
    where: { id: { in: jobIds } },
  });
  
  res.json({ deleted: result.count });
});

// ===== VULNERABILITY MANAGEMENT ENDPOINTS =====

// Get vulnerability summary
router.get('/vulnerabilities/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await getLatestReportSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed vulnerability reports (paginated)
router.get('/vulnerabilities/reports', async (req: Request, res: Response) => {
  try {
    const scanType = req.query.scanType as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = parseInt(req.query.skip as string) || 0;
    
    const where = scanType ? { scanType: scanType as any } : {};
    
    const [reports, total] = await Promise.all([
      prisma.vulnerabilityReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.vulnerabilityReport.count({ where }),
    ]);
    
    res.json({ reports, total, limit, skip });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single vulnerability report details
router.get('/vulnerabilities/report/:id', async (req: Request, res: Response) => {
  try {
    const report = await prisma.vulnerabilityReport.findUnique({
      where: { id: req.params.id },
    });
    
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger manual vulnerability scan
router.post('/vulnerabilities/scan', async (_req: Request, res: Response) => {
  try {
    await triggerImmediateScan();
    res.json({ 
      message: 'Vulnerability scan triggered',
      status: 'Scan started. Check back in a few minutes for results.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run immediate scan (synchronous - for testing)
router.post('/vulnerabilities/scan/immediate', async (_req: Request, res: Response) => {
  try {
    await runAllScans();
    const summary = await getLatestReportSummary();
    res.json({ 
      message: 'Scan completed',
      summary,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete old vulnerability reports
router.delete('/vulnerabilities/cleanup', async (req: Request, res: Response) => {
  try {
    const daysToKeep = parseInt(req.query.days as string) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await prisma.vulnerabilityReport.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });
    
    res.json({
      message: `Deleted reports older than ${daysToKeep} days`,
      deleted: result.count,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Content moderation — review and resolve user-submitted reports.
// Required by App Store Review Guideline 1.2 (timely admin response).
// ============================================================================

router.get('/moderation/reports', async (req: Request, res: Response) => {
  const status = (req.query.status as string | undefined) as ReportStatus | undefined;
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? '50', 10));
  const skip = Math.max(0, parseInt((req.query.skip as string) ?? '0', 10));

  const reports = await prisma.report.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: limit,
    skip,
    include: {
      reporter: { select: { id: true, username: true, email: true } },
    },
  });

  // Hydrate the target so the admin sees who/what was reported.
  const hydrated = await Promise.all(
    reports.map(async (r) => {
      if (r.targetType === 'TRYON_JOB') {
        const job = await prisma.tryOnJob.findUnique({
          where: { id: r.targetId },
          select: {
            id: true, userId: true, isPrivate: true, status: true,
            resultFullBodyUrl: true, resultMediumUrl: true,
            user: { select: { id: true, username: true } },
          },
        });
        return { ...r, target: job ? await presignTryOnJob(job) : job };
      }
      if (r.targetType === 'COMMENT') {
        const comment = await prisma.comment.findUnique({
          where: { id: r.targetId },
          select: {
            id: true, jobId: true, userId: true, body: true, createdAt: true,
            user: { select: { id: true, username: true, email: true, avatarUrl: true } },
          },
        });
        return {
          ...r,
          target: comment
            ? { ...comment, user: await presignAvatarOnly(comment.user) }
            : comment,
        };
      }
      const user = await prisma.user.findUnique({
        where: { id: r.targetId },
        select: { id: true, username: true, email: true, bio: true, avatarUrl: true },
      });
      return { ...r, target: user ? await presignAvatarOnly(user) : user };
    }),
  );

  res.json({ reports: hydrated, limit, skip });
});

router.patch('/moderation/reports/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, resolverNote, removeContent } = req.body as {
    status?: ReportStatus;
    resolverNote?: string;
    removeContent?: boolean;
  };

  if (status && !['OPEN', 'REVIEWING', 'RESOLVED_REMOVED', 'RESOLVED_NO_ACTION'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) { res.status(404).json({ error: 'Report not found' }); return; }

  // If admin chose to remove the offending content, do that atomically
  // alongside resolving the report.
  if (removeContent && report.targetType === 'TRYON_JOB') {
    await prisma.tryOnJob.update({
      where: { id: report.targetId },
      data: { isPrivate: true },
    }).catch(() => null);
  } else if (removeContent && report.targetType === 'COMMENT') {
    // Hard-delete the offending comment and decrement the parent's count.
    const comment = await prisma.comment.findUnique({
      where: { id: report.targetId },
      select: { id: true, jobId: true },
    });
    if (comment) {
      await prisma.$transaction([
        prisma.comment.delete({ where: { id: comment.id } }),
        prisma.tryOnJob.update({
          where: { id: comment.jobId },
          data: { commentsCount: { decrement: 1 } },
        }),
      ]).catch(() => null);
    }
  }

  const updated = await prisma.report.update({
    where: { id },
    data: {
      status: status ?? (removeContent ? 'RESOLVED_REMOVED' : 'REVIEWING'),
      resolverNote: resolverNote ?? null,
      resolvedAt: status?.startsWith('RESOLVED') || removeContent ? new Date() : null,
    },
  });

  res.json(updated);
});

export default router;
