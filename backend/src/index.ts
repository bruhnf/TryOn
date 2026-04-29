import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import tryonRoutes from './routes/tryon';
import profileRoutes from './routes/profile';
import friendsRoutes from './routes/friends';
import feedRoutes from './routes/feed';
import adminRoutes from './routes/admin';
import creditsRoutes from './routes/credits';

import './queue/tryonWorker';

const app = express();

// Trust first proxy (needed for rate limiting behind reverse proxy / Expo)
app.set('trust proxy', 1);

// Debug logging for all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

app.use(helmet({
  crossOriginResourcePolicy: env.isDev ? false : { policy: 'same-origin' },
}));
app.use(cors({ 
  origin: env.isDev ? true : env.allowedOrigins, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}));
app.use(express.json({ limit: '10mb' }));

app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true }),
);

// Rate limit only applies to POST (job submissions), not GET (status polling)
import { Request, Response, NextFunction } from 'express';
const tryonPostLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true });
app.use('/api/tryon', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST') {
    return tryonPostLimiter(req, res, next);
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tryon', tryonRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/credits', creditsRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  },
);

app.listen(env.port, () => {
  console.log(`TryOn backend running on port ${env.port} [${env.nodeEnv}]`);
});
