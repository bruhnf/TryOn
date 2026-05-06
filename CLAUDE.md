# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment Notice

**This is a test and development environment.** There is no need to preserve existing users, tokens, or data when making schema changes or migrations. Feel free to drop and recreate the database as needed.

---

## ⚠️ DEPLOYMENT CHECKLIST

**Every time you deploy to Lightsail, run ALL of these commands:**

```bash
ssh ubuntu@<your-lightsail-ip>
cd /opt/evofaceflow/TryOn
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy  # ⚠️ DON'T SKIP!
```

> **🚨 The `prisma migrate deploy` step is REQUIRED after any schema changes or the backend will crash!**

---

## Project Overview

TryOn is an AI-powered virtual clothing try-on mobile app. The "Try-On" mobile app is part of Evo Face Flow and uses evofaceflow.com for it's domain name. It is a monorepo with two main packages: 
- `backend/` — Node.js/Express REST API with TypeScript
- `frontend/` — React Native (Expo) mobile app

Users upload personal body photos to their profile (full body front, medium/waist-up, close-up), then photograph articles of clothing or full outfits while shopping. The app calls the xAI Grok Imagine API to generate images of the user wearing those items, returned in the perspective(s) matching whichever body photos the user has on file.

## Commands

### Backend
```bash
cd backend
npm run dev      # Development server with hot reload (ts-node-dev)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled production build
npm run migrate  # Run Prisma migrations
npm run seed     # Seed development data
```

### Frontend
```bash
cd frontend
npx expo start -c          # Dev server with cache clear
npx expo start --tunnel    # Dev server with ngrok (for Expo Go on physical device)
npm run android            # Android preview build
npm run ios                # iOS preview build
npm run web                # Web preview
```

### Switching Between Local and Live Backend

The frontend can connect to either a local backend or the live Lightsail server. Configure this in `frontend/src/config/api.ts`:

```typescript
// Change USE_LOCAL to switch environments:
const USE_LOCAL = false;  // false = live server, true = local

const LOCAL_URL = 'http://localhost:3000/api';
const LIVE_URL = 'https://api.evofaceflow.com/api';
```

**Local Development Setup (Emulator/Simulator):**
1. Set `USE_LOCAL = true` in `frontend/src/config/api.ts`
2. Start backend: `cd backend && npm run dev`
3. Start frontend: `cd frontend && npx expo start`
4. Press `a` for Android emulator or `i` for iOS simulator

**Local Development Setup (Physical Device - iPhone/Android):**

Testing on a physical device with local backend requires exposing your local backend to the internet. There are two approaches:

**Option A: Use Live Backend (Recommended for quick testing)**
1. Set `USE_LOCAL = false` in `frontend/src/config/api.ts`
2. Start frontend: `cd frontend && npx expo start --tunnel`
3. Scan QR code with Expo Go app on your phone
4. Backend is already running on Lightsail

**Option B: Use Local Backend with ngrok (Full local stack)**
1. Install ngrok: https://ngrok.com/download
2. Start backend services: `docker-compose up -d` (or `cd backend && npm run dev`)
3. Expose backend with ngrok: `ngrok http 3000`
4. Copy the ngrok URL (e.g., `https://abc123.ngrok-free.app`)
5. Update `frontend/src/config/api.ts`:
   ```typescript
   const LOCAL_URL = 'https://abc123.ngrok-free.app/api';  // Your ngrok URL
   const USE_LOCAL = true;
   ```
6. Start frontend with tunnel: `cd frontend && npx expo start --tunnel`
7. Scan QR code with Expo Go app on your phone
8. Connect to the Admin Dashboard using http://localhost:3000/admin 

> **Note:** The frontend already includes the `ngrok-skip-browser-warning` header to bypass ngrok's browser warning page.

**Important:** Always set `USE_LOCAL = false` before committing to ensure production builds use the live server.

### Docker (Backend Services Only)

Docker Compose runs the **backend infrastructure only** (PostgreSQL, Redis, and the Express API). The frontend must always be started separately with Expo.

```bash
# Start backend services (PostgreSQL + Redis + Backend API on port 3000)
docker-compose up --build

# Then in a separate terminal, start the frontend:
cd frontend && npx expo start

# For production-like environment (includes nginx, fail2ban):
docker-compose -f docker-compose.prod.yml up --build
```

**What Docker Compose includes:**
- `postgres` — PostgreSQL 15 database on port 5432
- `redis` — Redis 7 for BullMQ job queue on port 6379
- `backend` — Express API on port 3000 with hot reload

**What Docker Compose does NOT include:**
- Frontend (React Native/Expo) — always run separately
- ngrok tunnel — set up separately if needed for physical device testing

### CI/CD
GitHub Actions workflow (`.github/workflows/deploy.yml`) triggers on push to `main`. It runs a TypeScript build check and Prisma migration check, then SSHs into AWS Lightsail to pull and restart containers via `docker-compose.prod.yml`.

---

## Logging

The backend uses **Winston** for structured logging with daily file rotation.

### Log Levels
- `error` - Application errors, exceptions, failed operations
- `warn` - Warnings, deprecations, suspicious activity (e.g., suspicious login locations)
- `info` - Key business events, state changes, successful operations
- `http` - HTTP request/response logging
- `debug` - Detailed debugging information (verbose in dev)

### Environment Variables
```bash
LOG_LEVEL=debug       # Set log level (default: debug in dev, info in prod)
LOG_DIR=/var/log/tryon  # Log file directory (default: ./logs)
LOG_TO_FILE=true      # Enable file logging in development
```

### Log Files (Production)
Located at `/var/log/tryon/` (Docker volume `backend_logs`):
- `combined-YYYY-MM-DD.log` - All logs, rotated daily, 14-day retention
- `error-YYYY-MM-DD.log` - Errors only, 30-day retention
- `exceptions-YYYY-MM-DD.log` - Unhandled exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

### Viewing Logs
```bash
# On Lightsail server
docker compose -f docker-compose.prod.yml logs -f backend  # Live Docker logs
docker compose -f docker-compose.prod.yml exec backend tail -f /var/log/tryon/combined-$(date +%Y-%m-%d).log

# Or mount volume directly
docker volume inspect www_backend_logs  # Find mount point
tail -f /var/lib/docker/volumes/www_backend_logs/_data/combined-*.log
```

### Log Management Strategy
1. **Daily rotation** prevents single files from growing too large
2. **14-day retention** for combined logs (configurable)
3. **30-day retention** for error logs (useful for debugging recurring issues)
4. **Gzip compression** of rotated logs saves disk space
5. **Correlation IDs** in `x-correlation-id` header trace requests across services

### What's Logged
- HTTP requests/responses (method, path, status, duration, user ID)
- Authentication events (login, signup, failed attempts, token refresh)
- External API calls (Grok/xAI, ip-api, SMTP) with timing and status
- Job processing (try-on queue events)
- File uploads (S3 operations)
- Security events (rate limiting, suspicious locations)
- Database errors and slow queries (>1s)

---

## Architecture

### Website (`website/`)
Static landing page for evoFaceFlow with web authentication.

- **index.html** — Main landing page promoting TryOn app
- **login.html** — Web login page
- **signup.html** — Web signup page
- **css/style.css** — Black/white minimal design
- **js/auth.js** — Client-side authentication (calls backend API)

**URLs:**
- `https://evofaceflow.com` — Landing page
- `https://www.evofaceflow.com` — Redirects to non-www
- `https://api.evofaceflow.com` — Backend API

**Note:** The website makes API calls to `api.evofaceflow.com`. Ensure `ALLOWED_ORIGINS` in backend `.env` includes `https://evofaceflow.com`.

### Backend (`backend/src/`)
Express app with JWT authentication and BullMQ job queue for async AI image generation.

- **Entry point**: `index.ts` — mounts all middleware (Helmet, CORS, rate limiting) and routes
- **Routes**: `routes/` — `auth`, `upload`, `tryon`, `admin`, `friends`, `feed`, `profile`, `credits`
- **Controllers**: `controllers/` — one per route group
- **Services**: `services/grokService.ts` — calls xAI Grok Imagine API for AI image generation
- **Services**: `services/locationService.ts` — geo-IP lookup and suspicious-location detection
- **Services**: `services/emailService.ts` — sends account verification and transactional emails
- **Queue**: `queue/` — BullMQ workers consume try-on job payloads backed by Redis
- **Middleware**: `middleware/` — JWT verification, subscription gating, upload validation
- **Prisma**: `prisma/schema.prisma` — database schema; migrations in `prisma/migrations/`

**Try-on flow:**
1. Client uploads 1 item of clothing or outfit photo → S3 via multer-s3
2. Backend determines which user body photos exist (full body, medium — never close-up/profile)
3. If neither full body nor medium exists → return 422 with `NO_BODY_PHOTOS` error code; frontend shows the upload prompt dialog
4. Job queued in Redis (BullMQ) with S3 URLs for clothing photo + available user body photo URLs
5. Worker calls Grok Imagine API once per available body photo perspective
6. Result images stored in S3; job result written back to DB
7. Client polls or receives push notification on completion

**Body photo priority rule (enforced in service layer):**
- Primary output: full body photo perspective
- Fallback: medium/waist-up photo perspective
- Close-up/profile photo: NEVER used as input to Grok Imagine

### Frontend (`frontend/src/`)
React Native app using Expo with React Navigation and Zustand for state.

- **Screens**: `screens/`
  - `LoginScreen` — email + password
  - `SignupScreen` — username, email, password (minimal, no photo required to proceed)
  - `OnboardingPhotoScreen` — soft prompt to upload body photos after signup; can skip
  - `HomeScreen` — scrollable feed of community or personal try-on results
  - `TryOnScreen` — main feature; upload 1–2 clothing/outfit photos, view AI results
  - `ProfileScreen` — avatar, full body photo, medium photo, stats, videos/results grid
  - `EditProfileScreen` — edit bio, username, body photos
  - `FriendsScreen` — Following / Followers tabs + search
  - `ShopScreen` — browse clothing items (tab in bottom navigation)
  - `InboxScreen` — notifications and messages
  - `SettingsScreen` — account, notifications, privacy, subscription
  - `AdminConsoleScreen` — admin dashboard for managing users and jobs
  - `PurchaseScreen` — credit purchase flow
- **Components**: `components/` — shared UI (BodyPhotoCard, CreditDisplay, TryOnResultCard, TryOnDetailModal, FullScreenImageModal, HeaderMenu)
- **State**: `store/useUserStore.ts` — Zustand store holding authenticated user and body photo status
- **API config**: `config/api.ts` — base URL switching between dev and production
- **Hooks**: `hooks/useTryOn.ts`, `hooks/useBodyPhotos.ts`

**Navigation structure:**
- Unauthenticated stack: Login → Signup → Onboarding (skippable)
- Authenticated tabs: Home | Shop | [Camera FAB — TryOn] | Inbox | Profile
- Modal screens: Settings, EditProfile, AdminConsole, Purchase, Friends

**UI style:** Clean white/minimal design (see design screenshots). Black-and-white accent palette. Bottom tab bar with prominent centered camera FAB for quick try-on access. Typography: bold headers, light body text. Rounded pill-shaped toggle buttons for option selection.

---

## Database Schema (PostgreSQL via Prisma)

### Users
```
id            String   @id @default(uuid())
username      String   @unique
email         String   @unique
passwordHash  String
verified      Boolean  @default(false)
verifyToken   String?
verifyTokenExpiry DateTime?
passwordResetToken       String?
passwordResetTokenExpiry DateTime?
isSubscribed  Boolean  @default(false)   // true = active subscriber
credits       Int      @default(0)        // bonus credits for extra try-ons
firstName     String?
lastName      String?
bio           String?
avatarUrl     String?   // close-up / profile photo (used as profile avatar only)
fullBodyUrl   String?   // full-body front view (used for try-on)
mediumBodyUrl String?   // waist-up view (used for try-on fallback)
followingCount Int      @default(0)
followersCount Int      @default(0)
likesCount     Int      @default(0)
address       String?
city          String?
state         String?
createdAt     DateTime @default(now())
updatedAt     DateTime @updatedAt
```

### RefreshToken
```
id        String   @id @default(uuid())
userId    String
token     String   @unique
expiresAt DateTime
createdAt DateTime @default(now())
```

### TryOnJobs
```
id               String   @id @default(uuid())
userId           String
status           JobStatus  // PENDING | PROCESSING | COMPLETE | FAILED
isPrivate        Boolean  @default(false)
clothingPhoto1Url String
clothingPhoto2Url String?
resultFullBodyUrl  String?   // result image for full body perspective
resultMediumUrl    String?   // result image for medium perspective
perspectivesUsed   String[]  // ["full_body", "medium"] — records which inputs were used
errorMessage       String?
createdAt          DateTime @default(now())
updatedAt          DateTime @updatedAt
```

### UserLocations
Stores up to the last 10 login/session locations per user. A trigger or service layer prunes older rows when count exceeds 10.
```
id                String   @id @default(uuid())
userId            String
ip                String
country           String?
region            String?
city              String?
latitude          Float?
longitude         Float?
timezone          String?
trigger           String?  // "login" | "token_refresh" | "manual"
suspiciousLocation Boolean @default(false)
distanceFromLast  Float?   // km from previous location
timestamp         DateTime @default(now())
```

### Follows
```
followerId  String
followingId String
createdAt   DateTime @default(now())
@@id([followerId, followingId])
```

### AppSettings (admin-controlled)
```
key       String @id
value     String
updatedAt DateTime @updatedAt
```

### CreditTransaction
```
id          String   @id @default(uuid())
userId      String
type        CreditTransactionType  // PURCHASE | GRANT | USAGE | REFUND
amount      Int                    // positive for grants/purchases, negative for usage
description String?
createdAt   DateTime @default(now())
```

---

## Key Business Rules

### Body Photo Handling
- **avatarUrl** (close-up): displayed as profile photo everywhere. Never sent to Grok Imagine.
- **fullBodyUrl**: primary input to Grok Imagine. Priority 1 for output.
- **mediumBodyUrl**: fallback input. Used when fullBodyUrl is absent.
- If neither fullBodyUrl nor mediumBodyUrl exist: block try-on and prompt user to upload.
- If only avatarUrl exists: block try-on and prompt user to upload a medium or full body photo.
- The number of result images returned matches the number of available body photo perspectives (max 2).

### Onboarding / Photo Upload Consent
- Sign-up requires only: username, valid email, strong password.
- Email verification is required before the user can use try-on features.
- After signup, an onboarding screen encourages uploading body photos. It is skippable.
- Photo upload screens must display consent text: the user acknowledges that their body photos
  will be processed by third-party AI services (xAI/Grok) and stored on secure cloud infrastructure.
  Users may delete their photos and all AI-processed derivatives at any time from Settings.
- Body photo upload is also accessible at any time from Profile > Manage Body Photos.

### Subscription & Credits
- **Flat subscription model**: Users are either subscribed (`isSubscribed: true`) or free users.
- **Subscribers** get 15 try-ons per day included with their subscription.
- **Free users** must have credits to use the try-on feature.
- **Credits** can be purchased or granted by the app (promotional).
- When a subscriber exceeds their daily limit, credits are used automatically.
- All users upload 1 clothing item per try-on.
- Credit balance is displayed in the top-left corner of the app.
- Credit transactions are tracked in the `CreditTransaction` model (PURCHASE, GRANT, USAGE, REFUND).

### Geo / Location Tracking
- Location is recorded on every login and token refresh.
- The last 10 records per user are retained; older records are deleted automatically.
- `distanceFromLast` is calculated server-side using the Haversine formula.
- A location is flagged `suspiciousLocation = true` if `distanceFromLast` > 500 km within 2 hours.
- Suspicious logins trigger an email alert to the user.
- Location data is disclosed in the Privacy Policy. Users may request deletion via Settings.

---

## Image Processing

All uploaded images (body photos, clothing photos) undergo a two-stage resizing process:

### Frontend Resizing (Mobile)
- **Location**: `frontend/src/utils/imageUtils.ts` → `processImageForUpload()`
- **Purpose**: Convert HEIF/HEIC to JPEG, reduce upload bandwidth
- **Dimensions**:
  - Avatar photos: 512×512 (square)
  - Body photos: Up to 1536×2048 (max dimensions)
  - Clothing photos: Up to 1536×2048 (max dimensions)
- **Format**: JPEG at 85% quality
- **Features**: HEIF/HEIC to JPEG conversion (iOS compatibility)

### Backend Resizing (Server)
- **Location**: `backend/src/utils/imageProcessor.ts`
- **Purpose**: Standardize dimensions for AI processing and storage
- **Dimensions**:
  - **Body & Clothing photos**: Longest side scaled to **1024px**, aspect ratio preserved
    - Portrait 2:3 (e.g., 2000×3000) → 683×1024
    - Portrait 3:4 (e.g., 3000×4000) → 768×1024
    - Landscape 4:3 (e.g., 4000×3000) → 1024×768
    - Square (e.g., 2000×2000) → 1024×1024
  - **Avatar photos**: 512×512 (square, center crop)
- **Format**: JPEG at 90% quality (85% for avatars)
- **Features**: Auto-rotation based on EXIF, HEIF/HEIC detection and rejection

**Why two stages?**
1. Frontend resize reduces network bandwidth (uploading ~3MP vs 12MP+ originals)
2. Backend resize ensures consistent dimensions for the Grok Imagine API, regardless of upload source

---

## Infrastructure

- **Database**: PostgreSQL 15 (Prisma ORM)
- **Queue**: Redis 7 + BullMQ
- **Storage**: AWS S3 — separate prefixes: `body-photos/`, `clothing-photos/`, `tryon-results/`
- **Reverse proxy**: Nginx (production) with SSL via Let's Encrypt
- **Hosting**: AWS Lightsail Ubuntu 22.04
- **Email**: AWS SES (transactional) — verification emails, suspicious login alerts
- **Geo-IP**: ip-api.com or MaxMind GeoLite2 (server-side, never exposed to client)
- **Intrusion Prevention**: Fail2ban for automated IP banning

---

## Admin Dashboard

Access at `https://api.evofaceflow.com/admin` (requires `ADMIN_API_KEY`).

Features:
- **Dashboard**: User count, try-on jobs, subscribers, credits outstanding
- **Users**: List all users, create test users, verify accounts, toggle subscriptions, adjust credits
- **Try-On Jobs**: View recent jobs with status, perspectives used, result links
- **Security**: Suspicious login stats, flagged locations, user location history

Admin API endpoints (all require `X-Admin-Key` header):
- `GET /api/admin/stats` — dashboard statistics
- `GET /api/admin/users` — list users
- `POST /api/admin/users` — create test user
- `GET /api/admin/user/:id` — user details with location history
- `DELETE /api/admin/user/:id` — delete user
- `PATCH /api/admin/user/:id/verify` — toggle verification
- `PATCH /api/admin/user/:id/subscription` — toggle subscription
- `PATCH /api/admin/user/:id/credits` — adjust credits
- `GET /api/admin/jobs` — list try-on jobs
- `DELETE /api/admin/job/:jobId` — delete a single job
- `POST /api/admin/jobs/delete` — bulk delete jobs
- `GET /api/admin/security/stats` — suspicious login statistics
- `GET /api/admin/security/suspicious` — list suspicious logins

---

## Vulnerability Monitoring

The system includes automated vulnerability scanning to ensure security and identify required patches.

### Features
- **Scheduled Scans**: Automatically runs daily at 2:00 AM
- **NPM Dependencies**: Scans both backend and frontend npm packages using `npm audit`
- **System Packages**: Checks for Ubuntu/Debian package updates (apt-based systems)
- **Admin Dashboard**: Displays vulnerability counts by severity (Critical, High, Moderate, Low)
- **Manual Triggers**: Admins can trigger immediate scans from the dashboard

### Admin API Endpoints
All vulnerability endpoints require `X-Admin-Key` header:

- `GET /api/admin/vulnerabilities/summary` — get latest vulnerability summary
- `GET /api/admin/vulnerabilities/reports` — paginated scan history (query: `scanType`, `limit`, `skip`)
- `GET /api/admin/vulnerabilities/report/:id` — detailed report with full JSON output
- `POST /api/admin/vulnerabilities/scan` — trigger async vulnerability scan (returns immediately)
- `POST /api/admin/vulnerabilities/scan/immediate` — run synchronous scan (waits for completion)
- `DELETE /api/admin/vulnerabilities/cleanup?days=30` — delete reports older than X days

### Database Schema
```prisma
enum ScanType {
  NPM_BACKEND
  NPM_FRONTEND
  SYSTEM_PACKAGES
  DOCKER_IMAGES
  SSL_CERTIFICATE
}

model VulnerabilityReport {
  id                 String   @id @default(uuid())
  scanType           ScanType
  totalVulnerabilities Int    @default(0)
  criticalCount      Int      @default(0)
  highCount          Int      @default(0)
  moderateCount      Int      @default(0)
  lowCount           Int      @default(0)
  infoCount          Int      @default(0)
  details            String?  // Full npm audit JSON
  systemInfo         String?  // OS/Node/Docker versions
  packagesChecked    Int?
  fixAvailable       Boolean  @default(false)
  scanDurationMs     Int?
  errorMessage       String?
  createdAt          DateTime @default(now())
}
```

### Scan Schedule
- **Automatic**: Daily at 2:00 AM (configured in BullMQ)
- **Manual**: Trigger from admin dashboard or API
- **Retention**: Scan results stored indefinitely (can be cleaned up via API)

### Responding to Vulnerabilities
1. **Review**: Check admin dashboard "Vulnerabilities" tab
2. **Assess**: Click "View" on any report to see full details
3. **Fix**: Run `npm audit fix` in backend/frontend directories
4. **System Updates**: SSH to Lightsail and run `apt-get update && apt-get upgrade`
5. **Verify**: Trigger manual scan to confirm fixes

### Implementation Files
- `backend/src/services/vulnerabilityService.ts` — core scanning logic
- `backend/src/queue/vulnerabilityWorker.ts` — BullMQ worker and scheduler
- `backend/src/routes/admin.ts` — API endpoints
- `backend/public/admin.html` — dashboard UI (Vulnerabilities tab)

---

## Environment Variables

Backend requires a `.env` file. Key variables:

```
DATABASE_URL          # PostgreSQL connection string (Prisma)
JWT_SECRET            # generate: openssl rand -hex 32
JWT_REFRESH_SECRET    # separate secret for refresh tokens
ADMIN_API_KEY         # protects /api/admin routes
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_S3_BUCKET
REDIS_URL
GROK_API_KEY          # xAI API key for Grok Imagine
ALLOWED_ORIGINS       # comma-separated CORS whitelist
SES_FROM_ADDRESS      # verified SES sender address
GEOIP_API_KEY         # if using a paid geo-IP provider
```

---

## Security Notes

- Passwords hashed with bcrypt (cost factor ≥ 12).
- JWTs: short-lived access tokens (15 min) + long-lived refresh tokens (30 days) stored in HttpOnly cookies (web) or secure device storage (mobile).
- All S3 object URLs are pre-signed with short TTLs; no public bucket ACLs.
- Body photo S3 keys are prefixed with the userId and are not guessable.
- Rate limiting applied to `/api/auth` and `/api/tryon` endpoints.
- GDPR/CCPA: users can export and delete all personal data including body photos and AI results.
- The close-up photo path (`avatarUrl`) is validated server-side and excluded from all Grok API calls.

### Fail2ban & Rate Limiting

Production deployment includes fail2ban for automated IP banning:
- **nginx-404**: Bans IPs after 10+ 404 errors in 60 seconds (1 hour ban)
- **nginx-nophp**: Bans IPs requesting `.php` files (24 hour ban) — we don't serve PHP
- **nginx-wordpress**: Bans IPs requesting `wp-*` paths (24 hour ban) — we don't run WordPress
- **nginx-badbots**: Bans IPs sending malicious requests (SQL injection, XSS attempts)
- **nginx-auth**: Bans IPs with excessive failed auth attempts

Nginx also blocks common vulnerability scan targets at the edge (returns 444 / connection dropped):
- All `.php`, `.asp`, `.aspx`, `.jsp`, `.cgi` requests
- WordPress paths (`wp-admin`, `wp-content`, `wp-includes`, `xmlrpc.php`)
- Sensitive files (`.env`, `.git`, `.htaccess`)

Configuration files:
- `fail2ban/jail.local` — jail definitions
- `fail2ban/filter.d/*.conf` — filter regex patterns
- `nginx/nginx.conf` — rate limit zones and blocking rules
