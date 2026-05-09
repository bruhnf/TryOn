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

### Frontend (local Expo dev only — not for distribution)
```bash
cd frontend
npx expo start -c          # Dev server with cache clear (Expo Go / Dev Client)
npx expo start --tunnel    # Dev server with ngrok (for Expo Go on physical device)
npm run android            # Local native build via Xcode/Android Studio (expo run:android)
npm run ios                # Local native build via Xcode (expo run:ios)
npm run web                # Web preview (limited — most native modules don't work on web)
```

For TestFlight or App Store distribution, use **EAS Build** instead — see DEPLOYMENT.md §11. EAS is required for any build that includes native code that the user will install (the app uses `expo-iap`, `expo-secure-store`, etc. which all require a native build).

### Switching Between Local and Live Backend

The frontend can connect to either a local backend or the live Lightsail server. Configure this in `frontend/src/config/api.ts`:

```typescript
// Change USE_LOCAL to switch environments:
const USE_LOCAL = false;  // false = live server, true = local

const LOCAL_URL = 'http://localhost:3000/api';
const LIVE_URL = 'https://api.evofaceflow.com/api';
```

> **🚨 Expo Go does NOT work for this app.** The app depends on native modules that ship outside Expo Go's fixed module set (`expo-iap`, `expo-secure-store`, etc.). Launching in Expo Go fails at startup with `Cannot find native module 'ExpoIap'` and "App entry not found" on the device. Every device-testing flow below assumes a **dev client build** — either a simulator/emulator build via `expo run:*`, or an installed dev-client app via EAS Build. Once the dev client is installed, JS still hot-reloads from `npx expo start` like normal.

**One-time: build a dev client**

Pick the path that matches your machine and target device:

- **iOS Simulator (Mac only):** `cd frontend && npx expo run:ios` — builds and installs the dev client into the simulator. Requires Xcode.
- **Android Emulator (Mac/Windows/Linux):** `cd frontend && npx expo run:android` — builds and installs into the running emulator. Requires Android Studio.
- **Physical iPhone from Windows or without a Mac:** use **EAS Build** with the development profile:
  ```bash
  cd frontend
  npm install -g eas-cli           # one-time
  eas login                        # one-time
  eas build:configure              # one-time, creates eas.json if missing
  eas build --profile development --platform ios
  ```
  When the build finishes, EAS gives you a QR/install link. Install the resulting dev-client app on your iPhone (TestFlight or internal distribution). Rebuild only when you add or upgrade a native module — JS changes do not require a rebuild.
- **Physical Android device:** same flow with `--platform android`, or run `npx expo run:android` against the device with USB debugging enabled.

**Local Development Setup (Simulator/Emulator):**
1. Set `USE_LOCAL = true` in `frontend/src/config/api.ts`
2. Start backend: `cd backend && npm run dev`
3. Start frontend: `cd frontend && npx expo start`
4. Press `a` for Android emulator or `i` for iOS simulator (the dev client launches automatically once it's been built once via `expo run:*`)

**Local Development Setup (Physical Device — iPhone/Android):**

Requires the dev client to already be installed on the device (see one-time setup above). Then pick one approach for the backend:

**Option A: Use Live Backend (Recommended for quick testing)**
1. Set `USE_LOCAL = false` in `frontend/src/config/api.ts`
2. Start the metro bundler: `cd frontend && npx expo start --tunnel`
3. **Open the dev client app on your phone** (NOT Expo Go) and scan the QR code, or tap the project under "Recently opened" inside the dev client
4. Backend is already running on Lightsail — no local backend needed

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
6. Start the metro bundler: `cd frontend && npx expo start --tunnel`
7. **Open the dev client app on your phone** (NOT Expo Go) and scan the QR code
8. Admin Dashboard remains reachable at http://localhost:3000/admin from your dev machine

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
Static landing page for evoFaceFlow with web authentication. Hosted via the nginx container (mounted as `/var/www/website` per `docker-compose.prod.yml`).

- **index.html** — Main landing page promoting TryOn app
- **login.html** — Web login page
- **signup.html** — Web signup page
- **privacy.html** — **Privacy Policy** (linked from Settings, Signup consent, and PurchaseScreen disclosures). Required by App Store Review.
- **terms.html** — **Terms of Service** (same link surfaces). Required by App Store Review.
- **css/style.css** — Black/white minimal design
- **js/auth.js** — Client-side authentication (calls backend API)

**URLs:**
- `https://evofaceflow.com` — Landing page
- `https://evofaceflow.com/privacy.html` — Privacy Policy (referenced from `frontend/src/constants/legal.ts`)
- `https://evofaceflow.com/terms.html` — Terms of Service (same)
- `https://www.evofaceflow.com` — Redirects to non-www
- `https://api.evofaceflow.com` — Backend API
- `https://api.evofaceflow.com/admin` — Admin web dashboard (requires `ADMIN_API_KEY`)

**Note:** The website makes API calls to `api.evofaceflow.com`. Ensure `ALLOWED_ORIGINS` in backend `.env` includes `https://evofaceflow.com`. Any update to `privacy.html` / `terms.html` requires the nginx container to be redeployed (or restarted) on Lightsail to pick up the new files.

### Backend (`backend/src/`)
Express app with JWT authentication and BullMQ job queue for async AI image generation.

- **Entry point**: `index.ts` — mounts all middleware (Helmet, CORS, rate limiting) and routes
- **Routes**: `routes/` — `auth`, `upload`, `tryon`, `admin`, `friends`, `feed`, `profile`, `credits`, `notifications`, `likes`, `appleWebhook` (mounted at `/api/webhooks/apple`), `moderation` (mounted under `/api`, exposes `/reports`, `/users/:id/block`, `/users/me/blocks`)
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
  - `SignupScreen` — username, email, password (minimal, no photo required to proceed). Consent checkbox links to Privacy Policy and Terms of Service.
  - `OnboardingPhotoScreen` — soft prompt to upload body photos after signup; can skip
  - `HomeScreen` — scrollable feed of community try-on results. Three-dot menu on each card for Report/Block.
  - `TryOnScreen` — main feature; upload 1 clothing/outfit photo, view AI results
  - `ProfileScreen` — avatar, full body photo, medium photo, stats, results grid
  - `PublicProfileScreen` — view another user's public profile and try-on history. Header three-dot menu for Report/Block. Shows "you've blocked this user" empty state when applicable.
  - `EditProfileScreen` — edit bio, username, body photos
  - `FriendsScreen` — Following / Followers tabs + search
  - `InboxScreen` — in-app notifications (FOLLOW / LIKE / TRYON_COMPLETE)
  - `SettingsScreen` — account, subscription (Restore Purchases, Manage Subscription deep link), Privacy & Data (Blocked Users, Delete Body Photos, Export My Data, Delete Account), Legal (Privacy/Terms in WebBrowser), Admin (only visible to admin allowlist)
  - `BlockedUsersScreen` — list and unblock previously-blocked users (modal presentation so it stacks above Settings)
  - `AdminConsoleScreen` — admin-only screen, route only registered when `__DEV__ || user.isAdmin`
  - `PurchaseScreen` — StoreKit-driven purchase flow. Fetches localized prices from Apple, presents tiers + credit packs, real Restore Purchases. Auto-renew disclosure rendered adjacent to each subscribe button (App Store Guideline 3.1.2(a)).
- **Components**: `components/` — shared UI:
  - `BodyPhotoCard`, `CreditDisplay`, `HeaderMenu`
  - `TryOnResultCard`, `TryOnDetailModal`, `FullScreenImageModal` — each renders `AiGeneratedBadge` over result images
  - `AiGeneratedBadge` — visible "✨ AI-generated" pill required by Guideline 4.0
  - `ReportSheet` — bottom-sheet modal with 6 reason options (INAPPROPRIATE, HARASSMENT, IMPERSONATION, SPAM, COPYRIGHT, OTHER) + free-text details. Used by HomeScreen and PublicProfileScreen.
- **Services**: `services/iap.ts` — wraps `expo-iap`. Manages connection lifecycle, fetches localized products, initiates StoreKit purchases with `appAccountToken: user.id`, posts signed JWS to backend `/api/credits/verify-receipt`, finishes transactions only after backend confirms.
- **State**: `store/useUserStore.ts` — Zustand store holding authenticated user (including `isAdmin` flag from server). `store/useNotificationStore.ts` — unread count for inbox tab badge.
- **API config**: `config/api.ts` — base URL switching between dev and production
- **Constants**: `constants/legal.ts` — Privacy Policy URL, Terms of Service URL, support / privacy email addresses
- **Hooks**: `hooks/useTryOn.ts`, `hooks/useBodyPhotos.ts`

**Navigation structure:**
- Unauthenticated stack: Login → Signup → Onboarding (skippable)
- Authenticated tabs: Home | [Camera FAB — TryOn] | Inbox | Profile (4 tabs total — no Shop tab)
- Modal screens: Settings, EditProfile, AdminConsole (dev/admin-only), Purchase, BlockedUsers
- Card screens: Friends, PublicProfile

**UI style:** Clean white/minimal design (see design screenshots). Black-and-white accent palette. Bottom tab bar with prominent centered camera FAB for quick try-on access. Typography: bold headers, light body text. Rounded pill-shaped toggle buttons for option selection.

---

## Database Schema (PostgreSQL via Prisma)

### Users
```
id                       String    @id @default(uuid())
username                 String    @unique
email                    String    @unique
passwordHash             String
verified                 Boolean   @default(false)
verifyToken              String?
verifyTokenExpiry        DateTime?
passwordResetToken       String?
passwordResetTokenExpiry DateTime?
tier                     UserTier  @default(FREE)   // FREE | BASIC | PREMIUM
credits                  Int       @default(0)
tryOnCount               Int       @default(0)      // lifetime successful try-ons
lastFreeCreditGrantAt    DateTime?                  // set once at email verification; retained for audit only
firstName                String?
lastName                 String?
bio                      String?
avatarUrl                String?   // S3 key — close-up; profile display only, never sent to Grok
fullBodyUrl              String?   // S3 key — full-body front; primary Grok input
mediumBodyUrl            String?   // S3 key — waist-up; fallback Grok input
followingCount           Int       @default(0)
followersCount           Int       @default(0)
likesCount               Int       @default(0)
address                  String?
city                     String?
state                    String?
createdAt                DateTime  @default(now())
updatedAt                DateTime  @updatedAt
```

### ApplePurchase
One row per StoreKit transaction. `originalTransactionId` ties renewals together so the active entitlement can be resolved.
```
id                    String    @id @default(uuid())
userId                String
transactionId         String    @unique  // unique per renewal
originalTransactionId String              // stable across renewals
productId             String              // e.g. com.evofaceflow.tryon.basic.monthly
tier                  UserTier            // tier this purchase grants
expiresAt             DateTime?           // null for non-subscription IAPs
rawReceipt            String?             // signed JWS payload, kept for audit
revokedAt             DateTime?           // set on REFUND / REVOKE
createdAt             DateTime  @default(now())
updatedAt             DateTime  @updatedAt
```

### Like
```
id        String   @id @default(uuid())
userId    String
jobId     String   // TryOnJob being liked
createdAt DateTime @default(now())
@@unique([userId, jobId])
```

### Notification
In-app notifications shown on the Inbox screen. Distinct from Apple Server Notifications.
```
id        String           @id @default(uuid())
userId    String           // recipient
type      NotificationType // FOLLOW | LIKE | TRYON_COMPLETE
actorId   String?          // who triggered it
jobId     String?          // related TryOnJob, if any
read      Boolean          @default(false)
createdAt DateTime         @default(now())
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
id                String    @id @default(uuid())
userId            String
status            JobStatus  // PENDING | PROCESSING | COMPLETE | FAILED
isPrivate         Boolean   @default(false)
clothingPhoto1Url String     // S3 key
clothingPhoto2Url String?    // S3 key
resultFullBodyUrl String?    // S3 key — result image for full body perspective
resultMediumUrl   String?    // S3 key — result image for medium perspective
bodyPhotoUrl      String?    // S3 key — primary body photo used as input (full body preferred, medium fallback)
perspectivesUsed  String[]   // ["full_body", "medium"] — records which inputs were used
likesCount        Int        @default(0)  // denormalized for feed performance
errorMessage      String?
createdAt         DateTime  @default(now())
updatedAt         DateTime  @updatedAt
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

### Report
User-submitted content/user reports. Required by App Store Review Guideline 1.2.
```
id           String           @id @default(uuid())
reporterId   String
targetType   ReportTargetType // TRYON_JOB | USER
targetId     String           // TryOnJob.id or User.id depending on targetType
reason       ReportReason     // INAPPROPRIATE | HARASSMENT | IMPERSONATION | SPAM | COPYRIGHT | OTHER
details      String?          // optional free-text from reporter
status       ReportStatus     // OPEN | REVIEWING | RESOLVED_REMOVED | RESOLVED_NO_ACTION
resolverNote String?          // admin note when resolving
resolvedAt   DateTime?
createdAt    DateTime         @default(now())
```

### UserBlock
Mutual-invisibility between two users. The blocked party also cannot see the blocker's content (prevents retaliation discovery).
```
blockerId String
blockedId String
createdAt DateTime @default(now())
@@id([blockerId, blockedId])
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
- **Tiered subscription model**: Each user has a `tier` of `FREE`, `BASIC`, or `PREMIUM` (see `UserTier` enum). There is **no** `isSubscribed` flag — check `tier !== 'FREE'` to gate subscriber-only features.
- **Tier configuration** lives in `backend/src/services/tierService.ts` (`TIER_CONFIG`). Current values:
  - `FREE`: 0 daily try-ons, $0.60/credit
  - `BASIC`: 2 daily try-ons, $0.50/credit
  - `PREMIUM`: 4 daily try-ons, $0.25/credit
- When a tiered user exhausts their daily included try-ons, additional try-ons spend credits.
- Credit balance is displayed in the top-left corner of the app and tapping it opens `PurchaseScreen`.
- Credit transactions are tracked in the `CreditTransaction` model (`PURCHASE`, `GRANT`, `USAGE`, `REFUND`).
- Lifetime try-on count per user is tracked in `User.tryOnCount` (incremented on successful job completion).

#### Free credit policy
- Each user receives **10 free credits ONCE** at email verification. There is no recurring grant.
- Implemented in `authController.verifyEmail` — atomically increments `User.credits` and writes a `CreditTransaction` of type `GRANT` with description "Welcome bonus — email verified".
- `User.lastFreeCreditGrantAt` is set at verification time. The field is retained for audit but no longer drives any logic.
- Once a user exhausts their 10 credits, they must purchase more or subscribe.

#### Legacy (dev-only) endpoints
The following endpoints exist but are gated to **dev only** and return **HTTP 410 Gone** in production with a message pointing users to the StoreKit flow:
- `POST /api/credits/subscribe` — direct tier mutation (use `/verify-receipt` instead)
- `POST /api/credits/purchase` — direct credit grant (use `/verify-receipt` instead)
- `POST /api/credits/unsubscribe` — direct downgrade to FREE (users cancel via iOS Settings; webhook fires EXPIRED)

Production uses **only** the `/api/credits/verify-receipt` path plus App Store Server Notifications. Granting entitlement via these legacy endpoints in production violates App Store Review Guideline 3.1.1.

### Apple In-App Purchases
- Two ingestion paths run in parallel for redundancy. **Both are idempotent on `transactionId`**:
  1. **Fast path (client → backend):** `POST /api/credits/verify-receipt` — the mobile app posts the StoreKit JWS immediately after a purchase succeeds. Backend verifies the JWS via Apple's CA chain, checks `appAccountToken === userId`, and applies the entitlement. Used so credits / tier appear instantly in the UI.
  2. **Authoritative path (Apple → backend):** **App Store Server Notifications V2** webhook at `POST /api/webhooks/apple`. Used for renewals, cancellations, refunds, and as a safety net if verify-receipt fails. See `backend/src/routes/appleWebhook.ts` and `backend/src/queue/appleNotificationWorker.ts`.
- StoreKit transactions are persisted in the `ApplePurchase` model (`transactionId` unique per renewal, `originalTransactionId` stable across the subscription lifetime, `productId`, `tier`, `expiresAt`, `revokedAt`).
- The product catalog (`backend/src/config/appleIap.ts`) is a discriminated union: products are either `{ type: 'subscription', tier }` or `{ type: 'credits', credits: N }`. Subscription notifications update `User.tier`; consumable notifications grant credits via a `CreditTransaction`.
- Product IDs (must match App Store Connect):
  - `com.evofaceflow.tryon.app.basic.monthly` → BASIC tier
  - `com.evofaceflow.tryon.app.premium.monthly` → PREMIUM tier
  - `com.evofaceflow.tryon.app.credits.10/25/50/100` → consumable credit packs
- The mobile app sets `appAccountToken` (= our `User.id` as UUID) on every StoreKit purchase so notifications can be mapped back to a user. The verify-receipt endpoint requires this match. Fallback identification (webhook only) is by `originalTransactionId` against existing `ApplePurchase` rows.
- Frontend uses `expo-iap` via `frontend/src/services/iap.ts`. The service handles connection lifecycle, fetches localized prices (`displayPrice`) from the App Store at runtime — **never hardcode prices** (Guideline 3.1.1(a)).
- `POST /api/credits/restore-purchases` is now a fallback that re-applies the most recent unexpired, non-revoked `ApplePurchase` from our DB. The primary Restore Purchases flow on the client uses `expo-iap`'s `getAvailablePurchases()` and re-posts each receipt to `/verify-receipt`. Both surfaces (PurchaseScreen and Settings) call the StoreKit version.
- iOS bundle identifier: `com.evofaceflow.tryon.app` (see `frontend/app.json`).
- **Apple root CA certificates** must be present in the backend at `backend/certs/apple/*.cer` (or wherever `APPLE_ROOT_CERTS_DIR` points). Download from https://www.apple.com/certificateauthority/ — at minimum `AppleRootCA-G3.cer`. Without these the JWS verifier cannot validate notifications. The Dockerfile `COPY certs ./certs` step bakes them into the production image.

### Content Moderation (App Store Guideline 1.2)
The app supports user-generated content (public try-on feed) and so must provide reporting, blocking, and content filtering.
- **Report:** Three-dot menu on every feed card (HomeScreen) and on PublicProfileScreen. Opens `ReportSheet` with 6 reason options. Submits to `POST /api/reports`. Reports are listed in admin moderation endpoints (`GET /api/admin/moderation/reports`) and resolved with `PATCH /api/admin/moderation/reports/:id` (optional `removeContent: true` flips `TryOnJob.isPrivate = true`).
- **Block:** Same three-dot menus expose Block. `POST /api/users/:userId/block` creates a `UserBlock` row; mutual filtering is applied to feed, public-profile, and search queries via `getInvisibleUserIds()` in `backend/src/utils/blocks.ts`. Blocking also deletes any existing follow links between the two users.
- **Unblock:** Settings → Privacy & Data → Blocked Users (`BlockedUsersScreen`) lists current blocks and allows unblocking via `DELETE /api/users/:userId/block`.
- **Filtering objectionable material from posting:** combination of (a) ToS prohibition, (b) xAI Grok's built-in content filters on AI-generated images, (c) user reports, (d) admin removal. There is no automated image moderation — adding AWS Rekognition or similar would harden this further.

### AI-Generated Content Disclosure (Guideline 4.0)
Every visible try-on result image carries an `AiGeneratedBadge` overlay ("✨ AI-generated"). Surfaces:
- `TryOnResultCard` (used in profile history)
- `HomeScreen` feed card result image
- `TryOnDetailModal` carousel
- `FullScreenImageModal` when caller passes `aiGenerated={true}` (HomeScreen passes false for clothing/body photo previews)

Profile-screen 3-column thumbnails are intentionally not badged — they're micro-previews that immediately open the detail modal where the badge is shown.

### Admin Access (UI gating)
- Backend admin endpoints require the `X-Admin-Key` header matching `ADMIN_API_KEY`.
- The mobile app's `AdminConsoleScreen` is gated by **two** independent layers:
  1. The Stack.Screen route is only registered when `__DEV__ || user.isAdmin`. Non-admin production users have no entry point at all.
  2. The Settings screen's "Admin Console" button is only shown when `user.isAdmin === true`.
- `user.isAdmin` is server-derived: `authController` and `profileController.getMyProfile` compute it via `isAdminEmail(email)` against the `ADMIN_EMAILS` env var (comma-separated allowlist).

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
- **Storage**: AWS S3 (`evofaceflow-uploads`) — separate prefixes: `body-photos/`, `clothing-photos/`, `tryon-results/`. Bucket has Block Public Access enabled and **no** bucket policy granting `s3:GetObject` to `Principal: "*"`. All reads go through the backend.
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
- `GET /api/admin/moderation/reports` — list user-submitted reports (filter by `?status=OPEN|REVIEWING|RESOLVED_REMOVED|RESOLVED_NO_ACTION`)
- `PATCH /api/admin/moderation/reports/:id` — resolve a report (body: `{ status, resolverNote, removeContent }`. `removeContent: true` flips `TryOnJob.isPrivate = true`.)

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
ADMIN_API_KEY         # protects /api/admin routes (X-Admin-Key header)
ADMIN_EMAILS          # comma-separated allowlist for in-app Admin Console UI visibility
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_S3_BUCKET
REDIS_URL
GROK_API_KEY          # xAI API key for Grok Imagine
ALLOWED_ORIGINS       # comma-separated CORS whitelist
SES_FROM_ADDRESS      # verified SES sender address
GEOIP_API_KEY         # if using a paid geo-IP provider
APPLE_BUNDLE_ID       # iOS bundle identifier (com.evofaceflow.tryon.app)
APPLE_APP_APPLE_ID    # numeric App Store ID from App Store Connect
APPLE_ENVIRONMENT     # "Production" or "Sandbox" — environment Apple sends from
APPLE_ROOT_CERTS_DIR  # path to dir holding Apple root CA .cer files inside the container (defaults to ./certs/apple)
```

---

## Security Notes

- Passwords hashed with bcrypt (cost factor ≥ 12).
- JWTs: short-lived access tokens (15 min) + long-lived refresh tokens (30 days) stored in HttpOnly cookies (web) or secure device storage (mobile).
- The S3 bucket is **private** (Block Public Access enabled, no public bucket policy). The DB stores bare S3 keys (e.g. `body-photos/<userId>/<file>.jpg`) in `User.avatarUrl`, `User.fullBodyUrl`, `User.mediumBodyUrl`, `TryOnJob.clothingPhoto1Url`, `TryOnJob.clothingPhoto2Url`, `TryOnJob.bodyPhotoUrl`, `TryOnJob.resultFullBodyUrl`, and `TryOnJob.resultMediumUrl`. Controllers mint presigned GET URLs at response time via `presignUserPhotos`, `presignTryOnJob`, `presignTryOnJobs`, and `presignAvatarOnly` in [backend/src/services/imageUrlService.ts](backend/src/services/imageUrlService.ts) (1-hour TTL). The helpers tolerate legacy rows that still hold full `https://...amazonaws.com/...` URLs by extracting the key.
- The Grok worker reads body and clothing inputs by S3 key via the AWS SDK — never via public URL — see `resolveS3Key()` in [backend/src/services/grokService.ts](backend/src/services/grokService.ts).
- When adding a new endpoint that returns image fields, route the response through the appropriate `presign*` helper before sending. Forgetting this on a new endpoint will produce 403s on the client once Block Public Access is on.
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
