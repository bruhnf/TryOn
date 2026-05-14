# TODOS.md

Consolidated list of every item we deferred, marked "for later," or otherwise punted during our work sessions. Compiled by scanning the full conversation history for phrases like *"we'll do that later," "Track 2," "deferred," "post-launch," "next release," "future,"* etc. Items in-flight in the current session are also included so nothing falls through the cracks.

**Criticality tags:**
- 🔴 **Critical** — actively required or breaks something today
- 🟠 **High** — operational risk if skipped much longer
- 🟡 **Medium** — meaningful improvement, can wait
- 🟢 **Low** — defensive, optional, or polish

**Last reviewed:** 2026-05-13. Update this file as items are completed or new items are deferred.

---

## 1. Active in current session — finish before closing out

### 🟠 CloudWatch Logs: set up alarms
**Improves:** Proactive paging when error rates spike or postgres logs FATAL — currently you'd only find out from user complaints or by checking logs by hand.
**Background:** Mentioned in current CloudWatch session: *"I'll set up the alarms (step ⑥) and docs (step ⑦) after you confirm both ③ and ④ are working."*
**Scope:** Two alarms via AWS Console — (a) backend error-rate > N/min for 5 min → email, (b) any postgres FATAL log entry → email.

### 🟠 CloudWatch Logs: document setup in DEPLOYMENT.md
**Improves:** Future-you (or anyone else) can rebuild the host from scratch and find the cloud-logs setup steps. Currently the install commands only exist in this chat.
**Background:** Same CloudWatch session — *"I'll set up the alarms (step ⑥) and docs (step ⑦)…"*
**Scope:** New section in DEPLOYMENT.md covering log groups, IAM user, agent install, env vars, alarms.

### 🟡 Switch nginx to stdout logging (Option A from nginx-logs discussion)
**Improves:** Brings nginx access + error logs into CloudWatch via the existing agent. Without this, only backend Winston logs reach CloudWatch — nginx access logs sit in the `nginx_logs` Docker volume on the host, invisible from the CloudWatch UI.
**Background:** *"My recommendation: Option A, but not now — bundle it with the next non-review-window deploy when you can take the nginx restart."* Explicitly deferred so Apple's reviewer doesn't see a brief 502 during a restart.
**Scope:** Replace `access_log /var/log/nginx/access.log main;` with `access_log /dev/stdout main;` (and similar for error_log) in nginx/nginx.conf. Restart nginx container.

### 🟡 CloudWatch Logs: per-service log group routing
**Improves:** Cleaner CloudWatch navigation; can set different retention or alarms per service.
**Background:** *"We'll switch to per-service groups later as a follow-up if you want. For now: one group, all container logs, simple."*
**Scope:** Switch from `awslogs` host-mount pattern to Docker's `awslogs` log driver per-service in docker-compose.prod.yml, OR add separate `collect_list` entries in the agent config for each container's log path.

---

## 2. Apple App Store cycle — next release or after current review settles

### 🔴 Resubmit 1.0.10 with EAS build after Apple replies to Face Data info request
**Improves:** Gets the app approved.
**Background:** Current review is paused on "Information Needed" (Guideline 2.1 face data question). Once we replied with face data details + updated privacy policy, Apple's review continues. If they accept, app is approved. If they ask follow-ups, we iterate. Either way, the existing 1.0.10 binary stands unless a code change becomes necessary.

### 🟡 Sentry — backend SDK integration (deferred)
**Improves:** Server-side exception tracking with stack traces + breadcrumbs. Currently if the Express app throws unexpected errors, you find out from log scraping after the fact.
**Background:** *"Postpone Sentry for now"* (user response when planning Track 1 work). Originally a P0 item from the post-launch readiness review.
**Scope:** Add `@sentry/node` to backend, gate on `SENTRY_DSN` env var, wire into Express error middleware. Create a Sentry project at sentry.io.

### 🟡 Sentry — React Native app integration (deferred)
**Improves:** Mobile crash tracking with full stack traces, breadcrumbs, release tagging. Currently you'd learn about crashes from 1-star App Store reviews.
**Background:** Same Sentry deferral. Plus: *"The Sentry React Native app integration ships in 1.0.11 (next release) — needs a new EAS build."*
**Scope:** Add `@sentry/react-native` to frontend, configure Sentry in `App.tsx`, set up source-map upload in EAS post-install hooks.

### 🟡 Privacy Manifest (PrivacyInfo.xcprivacy) for the app bundle
**Improves:** Avoids an automated email warning from Apple at next binary upload. As of May 2024 Apple requires a privacy manifest declaring data types collected and required-reason APIs used. Submissions still go through, but Apple is increasing enforcement.
**Background:** From the App Store compliance audit: *"My recommendation: Go with (B) for the resubmission to avoid scope creep, but add a TODO for the next release."* Item flagged 🟡 in the audit.
**Scope:** Generate a basic PrivacyInfo.xcprivacy after `npx expo prebuild` and place it in the iOS bundle. Declare data types (email, photos, etc.) and required-reason APIs (UserDefaults, FileTimestamp).

### 🟢 In-app support / contact link
**Improves:** Users (and App Store reviewers) can email support without leaving the app or visiting the privacy policy. Currently the only support email is in the privacy policy footer and AppReviewerSummary.md.
**Background:** From the App Store compliance audit "🟢 Optional improvements": *"Apple sometimes flags lack of in-app support contact."*
**Scope:** Add a Settings → Help / Contact Support row that opens `mailto:support@evofaceflow.com` via `Linking.openURL`.

---

## 3. Operational hardening — short-term (Track 2 from post-launch readiness plan)

### 🟠 Deep `/health` endpoint that probes Postgres + Redis
**Improves:** UptimeRobot currently shows "up" as long as the Express process is running, even when Postgres or Redis is unreachable. A deep healthcheck fails when dependencies are degraded, so external monitoring catches dep outages.
**Background:** *"P0 item — Deep health check. `GET /health` should `SELECT 1` against Postgres and `PING` Redis, fail in <2s, return per-dependency status."* On the Track 2 list, deferred to "after App Store decision lands." Drafted code was rejected before it could be saved when user wanted to do branch hygiene first.
**Scope:** New `/health` route that does parallel checks with 2s timeouts; return 503 if any dep down. Keep current shallow endpoint as `/health/live` for Docker healthcheck. UptimeRobot monitor automatically benefits.

### 🟠 nginx IP allowlist on `/api/admin`
**Improves:** Defense-in-depth on the admin surface. Today `X-Admin-Key` is the only gate — if the key leaks, an attacker can hit `/api/admin/*` from anywhere. With an IP allowlist, they'd also need to be on the admin network.
**Background:** Track 2 from post-launch readiness — *"P0 item #7 — Lock down `/api/admin`."* User confirmed *"Static IP allowlist at nginx (Recommended)"* but deferred deployment until after App Store decision.
**Scope:** Uncomment and configure the `allow <ip>; deny all;` block in nginx/nginx.conf §`location /api/admin`. Reload nginx.

### 🟠 Implement `SSL_CERTIFICATE` scan type in vulnerability scanner
**Improves:** Preemptive alerting when the Let's Encrypt cert is approaching expiry. Currently expiry alerting is passive — UptimeRobot's free tier dropped SSL monitoring, so you'd only learn from certbot's renewal-failure email or after the cert dies.
**Background:** From the audit: *"A preemptive SSL expiry check is planned via the existing vulnerability scanner — `VulnerabilityReport.scanType` already reserves a `SSL_CERTIFICATE` enum value."* Multiple mentions across docs.
**Scope:** Add a worker handler in `backend/src/queue/vulnerabilityWorker.ts` that runs `openssl s_client` against `api.evofaceflow.com:443`, parses notAfter, writes a `VulnerabilityReport` row with days-remaining. Alarm via existing daily scan schedule.

### 🟠 Bump backend container memory ceiling + set NODE_OPTIONS
**Improves:** Prevents OOM-kill of the Express backend under burst load. Sharp (image processing) can balloon to several hundred MB temporarily; the current 512MB limit + no Node heap limit makes the container fragile.
**Background:** P1 item #14 from the post-launch readiness review.
**Scope:** In docker-compose.prod.yml, bump `deploy.resources.limits.memory: 512M` → `1G` for backend service. Add `NODE_OPTIONS=--max-old-space-size=896` to backend env. Restart.

### 🟡 RUNBOOK.md
**Improves:** When something pages at 2am, you (or anyone covering for you) have a step-by-step. Without one, every incident is a fresh research project.
**Background:** P1 item #16 — *"Runbook for the 8–10 things most likely to break: DB connection lost, Redis full, S3 403s, Grok rate-limited, Apple webhook signature mismatch, disk full, cert expiry, OOM, backup failed."*
**Scope:** New RUNBOOK.md at repo root. Each scenario: how to detect, how to confirm, how to fix, how to verify.

### 🟡 Lightsail instance-role for backups (replace IAM access keys)
**Improves:** No AWS secrets on disk for the backup script. Auto-rotation handled by AWS. Reduces blast radius of host compromise.
**Background:** From backup setup discussion: *"Since your Lightsail instance already has an IAM role (`AmazonLightsailInstanceRole`), there's a cleaner v2 we can move to later: attach an S3 PutObject policy to the instance role itself, delete the access keys from /etc/tryon-backup.env."*
**Scope:** Attach an inline policy to the Lightsail instance role with `s3:PutObject` on `evofaceflow-backups/postgres/*`. Remove `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` lines from `/etc/tryon-backup.env`. Test backup still works.

### 🟡 Move secrets out of `.env` into AWS Secrets Manager / SSM Parameter Store
**Improves:** Secrets stop being baked into Lightsail snapshots. Centralized rotation. Audit trail of secret access.
**Background:** Track 1 setup AskUserQuestion: *"Defer to P1 (Recommended). Keep `.env` for launch."* Now on P1 list.
**Scope:** Refactor `backend/src/config/env.ts` to read from SSM Parameter Store at boot with `.env` fallback for local-dev. Migrate the live secrets to SSM. Update IAM so backend can read its parameters.

---

## 4. Operational hardening — medium-term (P1 list)

### 🟡 Application metrics (Prometheus / OpenTelemetry)
**Improves:** Quantitative observability — latency percentiles, request rate, error rate, queue depth — not just text logs. Required to define and track SLOs.
**Background:** P1 item #10. *"Without them you can't diagnose a slow app."*
**Scope:** Add `prom-client` to backend, expose `/metrics` on internal network. Run a Prometheus scrape (Grafana Cloud free tier is the easy path) or use CloudWatch Embedded Metric Format. Track p50/p95/p99 latency, error rate, Grok call latency + cost, BullMQ queue depth.

### 🟡 BullMQ failure alerts
**Improves:** Silent job failures = silent revenue loss. If Grok integration breaks, today the system refunds credits and logs — but nobody is paged.
**Background:** P1 item #11.
**Scope:** Either expose BullMQ metrics via prom-client and alert on `failed:tryon` counter, or write a small periodic worker that checks queue depth + failed count and emails on threshold breach. Surface in admin dashboard.

### 🟡 Mobile crash + analytics in app
**Improves:** Funnel visibility (signup → verify → first try-on → first purchase). Today you only have backend-side counts; no insight into where mobile users drop off.
**Background:** P1 item #12. Paired with Sentry RN.
**Scope:** PostHog free tier is mobile-friendly. Add `posthog-react-native` to frontend, track key events (signup, verify, first try-on, first purchase). Defer until Sentry RN is in.

### 🟡 CloudWatch agent for host metrics (CPU, memory, disk, network)
**Improves:** Coarse Lightsail console metrics today; CloudWatch agent gives detailed host metrics with alarms (disk >80%, memory >85%, CPU >90% for 5 min).
**Background:** P1 item #15. The CloudWatch agent we installed for logs CAN also ship metrics with a config addition — but we didn't enable that yet.
**Scope:** Extend the existing agent config at `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json` with a `metrics` section. Update IAM policy to add `cloudwatch:PutMetricData`. Add CloudWatch alarms for the three host thresholds.

### 🟢 ATT (App Tracking Transparency) no-op
**Improves:** Defensive — some App Store Connect configurations expect ATT even when not used. A `NSUserTrackingUsageDescription` no-op string saying "TryOn does not track for advertising" pre-empts a confused reviewer.
**Background:** From the audit "🟢 Optional improvements" — *"Skip unless Apple asks."*
**Scope:** Add `expo-tracking-transparency` plugin to app.json with a no-op purpose string. No code calls needed.

---

## 5. Operational hardening — long-term (P2 list, scale-dependent)

### 🟡 Migrate to managed Postgres (Lightsail Managed Database or RDS)
**Improves:** Point-in-time recovery, automated failover, automatic patching. Today a single Postgres container with daily dumps.
**Background:** P2 item — *"Migrate when single-instance latency starts mattering."*
**Scope:** Provision an RDS or Lightsail Managed Database. Migrate the schema + data. Repoint `DATABASE_URL`. Decommission the container.

### 🟡 Postgres read replica for heavy analytics queries
**Improves:** Admin dashboard aggregation queries (user counts, job stats, etc.) won't compete with user-facing transactions.
**Background:** P2 item — *"The admin dashboard does some heavy aggregations."*
**Scope:** Set up read replica after managed Postgres migration. Add a separate `DATABASE_READ_URL` env. Route admin/analytics queries to the replica.

### 🟡 WAF in front of the API (AWS WAF or Cloudflare)
**Improves:** OWASP top 10 protection, bot mitigation, DDoS absorption you don't have today.
**Background:** P2 item.
**Scope:** Cloudflare free tier is the cheap path — point DNS at Cloudflare, configure SSL passthrough or full-strict, enable the managed ruleset. Lightsail TLS still terminates at nginx.

### 🟡 Blue/green deploys
**Improves:** Eliminate the ~30 second 502 window when `docker compose up -d --build` recreates the backend container.
**Background:** P2 item — *"At low usage this is invisible; at 100 RPS it's user-visible 502s."*
**Scope:** Two backend container instances behind nginx, swap one at a time. Requires nginx upstream config change and per-instance healthcheck.

### 🟡 SLO definition + Grafana dashboards
**Improves:** Quantitative target ("99.5% monthly availability + p95 latency <800ms") gives you an error budget to decide whether to ship risky changes.
**Background:** P2 item.
**Scope:** Pick SLOs, track them in Grafana on top of the Prometheus metrics, set burn-rate alerts.

### 🟡 Independent security review / pentest
**Improves:** Third-party validation that the architecture and code don't have exploitable holes. Especially relevant once real PII is at scale.
**Background:** P2 item — *"Once you have real PII at scale."*
**Scope:** Engage a security firm. Typical small-app pentest is $5–15k for a one-week engagement.

### 🟡 Centralized admin audit log
**Improves:** Forensic trail of who toggled which subscription, who deleted which user, who resolved which report. Today there's no record.
**Background:** P2 item.
**Scope:** Add an `AdminAction` model that records every admin API call (who, what, when, target, before/after). Write to an append-only S3 bucket with Object Lock for compliance.

### 🟡 Secret rotation runbook (quarterly cadence)
**Improves:** Forces periodic rotation of JWT secrets, admin key, AWS keys, etc. Today they've never rotated.
**Background:** P2 item.
**Scope:** Document the rotation procedure for each secret in RUNBOOK.md. Calendar reminder quarterly.

---

## 6. Known bugs / minor issues

### 🟠 Redis eviction policy: change `allkeys-lru` to `noeviction`
**Improves:** Prevents BullMQ queue corruption under memory pressure. Current `allkeys-lru` will evict job keys silently if Redis hits maxmemory — that orphans in-flight try-on jobs.
**Background:** Noted while reviewing backend logs during CloudWatch setup — *"Redis allkeys-lru warnings (10 of them) — these are from BullMQ... real operational concern but separate from our current task; flag it for a follow-up."*
**Scope:** In docker-compose.prod.yml, change `--maxmemory-policy allkeys-lru` to `--maxmemory-policy noeviction` on the redis service. Restart redis.

### 🟢 Node 22 upgrade (AWS SDK v3 deprecation)
**Improves:** Future-proofs against the early-2027 AWS SDK requirement of Node 22+.
**Background:** Deprecation warning observed in backend logs during CloudWatch setup — *"AWS SDK for JavaScript (v3) versions published after the first week of January 2027 will require node >=22. You are running node v20.20.2."*
**Scope:** Update backend Dockerfile base image from `node:20-slim` to `node:22-slim`. Test Prisma + all native modules still build.

---

## 7. Documentation / verification tasks

### 🟠 Test the Postgres restore procedure on a staging instance
**Improves:** Confirms the backup is actually usable. Untested backups are hopes, not backups.
**Background:** From DEPLOYMENT.md §10.4 (which I wrote): *"Test this procedure at least once on a staging instance before you ever need it in production. An untested backup is a hope, not a backup."*
**Scope:** Spin up a throwaway VM or local Postgres. Run the documented restore steps using a recent dump. Verify the data looks correct.

### 🟢 Reset Location History admin endpoint
**Improves:** Currently clearing testuser location history (after Apple review caused suspicious-location flags) requires SSH + psql DELETE. A POST `/api/admin/user/:id/clear-locations` endpoint would be a 15-minute fix.
**Background:** From testuser1 suspicious-location discussion — *"If you'd rather I add an 'Reset location history' admin endpoint (POST `/api/admin/user/:id/clear-locations`) for future cleanups, that's a 15-minute change. Not needed for this round; just an option."*
**Scope:** New admin route in `backend/src/routes/admin.ts` that deletes all `UserLocation` rows for a given user id. Wire button in the admin dashboard.

### 🟢 Stale-doc fix: bring CLAUDE.md fully into sync with current state
**Improves:** Single source of truth for project conventions.
**Background:** Several stale claims caught during the compliance audit and ops work. Most have been fixed (GitHub Actions reference, Expo Go claim, version bumps). Worth a periodic re-read for new drift.
**Scope:** Periodic re-read. Update the "Last reviewed" date when you do.

---

## 8. Optional / defensive (suggested but not committed to)

### 🟢 AWS Rekognition image moderation for AI outputs
**Improves:** Belt-and-suspenders against App Store Guideline 1.1.4 if xAI's content filters ever miss something. Today the moderation pipeline relies on xAI filters + user reports + admin removal.
**Background:** From the App Store compliance audit "🟢 Optional improvements" — *"Not required if xAI's filters hold."*
**Scope:** After Grok returns a result, run AWS Rekognition Moderation API on the output image. If flagged, hold the result in a quarantine state for admin review before showing to the user.

### 🟢 GitHub Pages for hosted docs
**Improves:** The `docs/` HTML you generated could be public-web reachable.
**Background:** From the HTML docs setup — *"Publish via GitHub Pages — point Pages at /docs folder on main branch and you get a public URL with zero extra work. Only do this if you're OK with the docs being public."*
**Scope:** GitHub repo Settings → Pages → source = main branch / docs folder. No code change.

### 🟢 Dark mode for `docs/` HTML
**Improves:** Visual polish.
**Background:** From the HTML docs setup — listed under "Things you might want to change later."
**Scope:** Add a `prefers-color-scheme` CSS block to docs/styles.css.

### 🟢 Custom favicon / logo on `docs/` HTML
**Improves:** Visual polish.
**Background:** Same as dark mode.
**Scope:** Add `<link rel="icon">` to the template in `scripts/build-docs.js`.

### 🟢 Search index for `docs/` HTML
**Improves:** Search across the 3 docs.
**Background:** Same. *"Would need a JS index (Lunr or Pagefind); not worth it for 3 docs."*
**Scope:** Add Pagefind or Lunr as a post-build step.

---

## Maintenance of this file

- When you complete an item, move it to a `## ✅ Done` section at the bottom (or just delete it — git history preserves it).
- When something new is deferred mid-conversation, add it here with the same template.
- Re-scan once a month: are 🟠 items still 🟠, or has urgency changed?
