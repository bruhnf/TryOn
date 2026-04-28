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

import './queue/tryonWorker';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true }),
);
app.use(
  '/api/tryon',
  rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true }),
);

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tryon', tryonRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/admin', adminRoutes);

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
