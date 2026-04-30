# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment Notice

**This is a test and development environment.** There is no need to preserve existing users, tokens, or data when making schema changes or migrations. Feel free to drop and recreate the database as needed.

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

**Local Development Setup:**
1. Set `USE_LOCAL = true` in `frontend/src/config/api.ts`
2. Start backend: `cd backend && npm run dev`
3. Start frontend: `cd frontend && npx expo start`

**Live Server Testing:**
1. Set `USE_LOCAL = false` in `frontend/src/config/api.ts`
2. Start frontend: `cd frontend && npx expo start --tunnel`
3. Backend is already running on Lightsail

**Important:** Always set `USE_LOCAL = false` before committing to ensure production builds use the live server.

### Docker (full stack locally)
```bash
docker-compose up --build                              # Dev environment (PostgreSQL + Redis + backend)
docker-compose -f docker-compose.prod.yml up --build  # Production-like
```

### CI/CD
GitHub Actions workflow (`.github/workflows/deploy.yml`) triggers on push to `main`. It runs a TypeScript build check and Prisma migration check, then SSHs into AWS Lightsail to pull and restart containers via `docker-compose.prod.yml`.

---

## Architecture

### Backend (`backend/src/`)
Express app with JWT authentication and BullMQ job queue for async AI image generation.

- **Entry point**: `index.ts` — mounts all middleware (Helmet, CORS, rate limiting) and routes
- **Routes**: `routes/` — `auth`, `upload`, `tryon`, `admin`, `friends`, `feed`, `profile`
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
  - `InboxScreen` — notifications and messages
  - `SettingsScreen` — account, notifications, privacy, subscription
- **Components**: `components/` — shared UI (BodyPhotoUploadCard, TryOnResultCard, SubscriptionBadge, etc.)
- **State**: `store/useUserStore.ts` — Zustand store holding authenticated user and body photo status
- **API config**: `config/api.ts` — base URL switching between dev and production
- **Hooks**: `hooks/useTryOn.ts`, `hooks/useBodyPhotos.ts`

**Navigation structure:**
- Unauthenticated stack: Login → Signup → Onboarding (skippable)
- Authenticated tabs: Home | Friends | [Camera FAB — TryOn] | Inbox | Profile
- Hamburger/overflow menu on Profile: Settings, Edit Profile, Manage Body Photos, Logout

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
isSubscribed  Boolean  @default(false)   // true = active subscriber
credits       Int      @default(0)        // bonus credits for extra try-ons
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

### TryOnJobs
```
id               String   @id @default(uuid())
userId           String
status           JobStatus  // PENDING | PROCESSING | COMPLETE | FAILED
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
- `GET /api/admin/security/stats` — suspicious login statistics
- `GET /api/admin/security/suspicious` — list suspicious logins

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
