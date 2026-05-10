import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env';
import { logger, logApp, logSecurity } from './services/logger';
import { httpLogger, errorLogger } from './middleware/httpLogger';

import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import tryonRoutes from './routes/tryon';
import profileRoutes from './routes/profile';
import friendsRoutes from './routes/friends';
import feedRoutes from './routes/feed';
import adminRoutes from './routes/admin';
import creditsRoutes from './routes/credits';
import notificationsRoutes from './routes/notifications';
import likesRoutes from './routes/likes';
import appleWebhookRoutes from './routes/appleWebhook';
import moderationRoutes from './routes/moderation';
import commentsRoutes from './routes/comments';

import './queue/tryonWorker';
import './queue/vulnerabilityWorker';
import './queue/appleNotificationWorker';
import { scheduleVulnerabilityScans } from './queue/vulnerabilityWorker';

const app = express();

// Trust first proxy (needed for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// HTTP request logging (replaces console.log based logging)
app.use(httpLogger);

// Serve admin dashboard BEFORE helmet (needs inline scripts)
app.get('/admin', (_req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'");
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: env.isDev ? false : { policy: 'same-origin' },
  contentSecurityPolicy: env.isDev ? false : undefined,
}));

// CORS configuration
app.use(cors({ 
  origin: env.isDev ? true : env.allowedOrigins, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global rate limiter (fallback, less aggressive)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/health' || req.path.startsWith('/api/webhooks/'),
  handler: (req, res) => {
    logSecurity('rate_limit', { ip: req.ip, path: req.path, limiter: 'global' });
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  },
});
app.use(globalLimiter);

// Auth rate limiter (strict - prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  handler: (req, res) => {
    logSecurity('rate_limit', { ip: req.ip, path: req.path, limiter: 'auth' });
    res.status(429).json({ error: 'Too many authentication attempts, please try again later.' });
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Dedicated stricter limit for verification-email resends. Each request triggers
// a real SES send, so cost and abuse potential are higher than for other auth
// endpoints. Per-IP, 5 requests per 15 minutes is enough headroom for a
// legitimate user retrying a typo + retrying once more, but blocks scripted abuse.
const verificationEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification email requests, please try again later.' },
  handler: (req, res) => {
    logSecurity('rate_limit', { ip: req.ip, path: req.path, limiter: 'verification_email' });
    res.status(429).json({ error: 'Too many verification email requests, please try again later.' });
  },
});
app.use('/api/auth/resend-verification', verificationEmailLimiter);

// Upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload limit reached, please wait.' },
  handler: (req, res) => {
    logSecurity('rate_limit', { ip: req.ip, path: req.path, limiter: 'upload' });
    res.status(429).json({ error: 'Upload limit reached, please wait.' });
  },
});
app.use('/api/upload', uploadLimiter);

// Try-on rate limiter (POST only - job submissions)
import { Request, Response, NextFunction } from 'express';
const tryonPostLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 try-on submissions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Try-on limit reached, please wait.' },
  handler: (req, res) => {
    logSecurity('rate_limit', { ip: req.ip, path: req.path, limiter: 'tryon' });
    res.status(429).json({ error: 'Try-on limit reached, please wait.' });
  },
});
app.use('/api/tryon', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST') {
    return tryonPostLimiter(req, res, next);
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tryon', tryonRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/webhooks', appleWebhookRoutes);
app.use('/api', moderationRoutes);
// Mounted at /api so paths can be `/tryon/:jobId/comments` (extending the
// existing /api/tryon namespace without modifying tryonRoutes) and
// `/comments/:commentId` for delete.
app.use('/api', commentsRoutes);

// Health check (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error logging middleware (before error handler)
app.use(errorLogger);

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // Error already logged by errorLogger middleware
    
    // Don't leak error details in production
    if (env.isDev) {
      res.status(500).json({ error: err.message, stack: err.stack });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

app.listen(env.port, () => {
  logApp('startup', {
    component: 'express',
    message: `TryOn backend running on port ${env.port}`,
    port: env.port,
    environment: env.nodeEnv,
    logLevel: process.env.LOG_LEVEL || (env.isDev ? 'debug' : 'info'),
  });
  
  // Schedule daily vulnerability scans
  scheduleVulnerabilityScans().catch((err) => {
    logger.error('Failed to schedule vulnerability scans', { error: err.message });
  });
});
