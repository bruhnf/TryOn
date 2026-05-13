Thank you for reviewing TryOn.

OVERVIEW

TryOn is an AI-powered virtual clothing try-on app. Users upload body
photos (full-body, waist-up, close-up profile), then photograph clothing
items. The app sends the body and clothing photos to xAI's Grok Imagine
API and returns the user wearing the clothing. The close-up photo is
used only as a profile picture and is never sent to AI services.

SIGN IN — DEMO ACCOUNTS
The Login screen takes EMAIL (not username).

Primary (Premium, 30 credits, body photos pre-loaded)
  Email:    testuser1@evofaceflow.com
  Password: 0e99752ceb71

Secondary (Basic, 5 credits, body photos pre-loaded) — for peer flows
(follow, block, report) from a second device or session
  Email:    testuser2@evofaceflow.com
  Password: 6db0d3d6aa99

testuser1 is also entered in App Store Connect's demo-account fields.

CORE FEATURE WALKTHROUGH (testuser1)
1. Tap the camera icon (TryOn) in the bottom tab bar.
2. Tap "Add Clothing Photo" and capture a garment image or select one from your camera roll.
3. Tap "Generate Try-On". Result returns in 10-30 seconds with a clear
   "AI-generated" disclosure pill on every surface (Guideline 4.0).

NOTE ON RAPID-FIRE TESTING
To control Grok API cost, a soft per-user throttle paces bursts. The
first 5 submissions in a rolling 15 minutes run immediately for Premium
users (testuser1). Beyond that, subsequent submissions are accepted but
queued with a visible "starts in 1:00" countdown that ladders up to a
10-minute cap. This is intentional pacing — the job still runs, just
deferred. Cancelling and resubmitting does not bypass it. If your test
plan involves many sequential generations, expect the countdown screen
after the 5th in the window.

NAVIGATION
Five tabs: Home (Discover) | Friends | TryOn (centered FAB) | Inbox |
Profile. Settings, Edit Profile, and Purchase are modals.

IN-APP PURCHASES
StoreKit V2 + App Store Server Notifications V2.
- Two auto-renewing subscriptions: Basic $9.99/mo, Premium $19.99/mo.
- Twelve consumable credit packs: 4 sizes (10/25/50/100) × 3 tier
  variants (Free/Basic/Premium). Same size grants same credits; only
  price differs. The client offers only the variant matching the user's
  tier, so Premium members get the lowest per-credit price.

Tier benefits:
- BASIC: 12 sessions per rolling 7-day window + reduced credit pricing.
- PREMIUM: 24 sessions per rolling 7-day window + lowest credit pricing.
- FREE: 10 credits granted once at email verification.

To test: tap the credits indicator (upper-left) to open "Get More
Try-Ons". Subscribe buttons show localized App Store prices and an
auto-renewal disclosure adjacent to the button (Guideline 3.1.2(a)).
Credit cards show both pack price and per-credit price. "Restore
Purchases" is on this screen and in Settings. "Manage Subscription"
opens iOS Settings > Apple ID > Subscriptions. Entitlement is granted
only after Apple-signed receipt verification on the backend; tier and
credits are never granted client-side.

PRIVACY
- Policy: https://evofaceflow.com/privacy.html
- Terms:  https://evofaceflow.com/terms.html
Linked from Settings, Sign-Up consent, and the purchase disclosure.

Settings > Privacy & Data:
- Delete All Body Photos (removes uploads + AI derivatives).
- Export My Data (GDPR/CCPA) — JSON of profile, try-ons, locations,
  credit transactions, and Apple receipts.
- Blocked Users (list + unblock).
- Delete Account (permanent).

THIRD-PARTY DATA PROCESSING
Body and clothing photos are sent to xAI Grok Imagine for generation,
disclosed in Privacy Policy §3 and consented to at Sign-Up. Photos and
results are stored in a private S3 bucket and served via short-lived
presigned URLs — no public bucket access.

FACE DATA
The app does NOT perform face recognition, face detection, facial
geometry mapping, biometric identification, or any automated facial
analysis. No ARKit Face APIs, Vision framework face APIs, TrueDepth,
FaceID, or other facial-analysis API is used. The only "face data"
we handle is the photographic images themselves — the photos the user
uploads (close-up, full-body, waist-up) and the AI-generated try-on
results derived from them.

Face data usage:
- Close-up photo: profile picture only. NEVER sent to any AI service.
- Full-body / waist-up photos: sent to xAI Grok Imagine for AI try-on
  generation, together with the user-supplied clothing photo. Used
  for nothing else.
- AI try-on results: stored against the user's account; visible to
  the user in their Profile; visible on the public feed only if the
  user does not mark the result as private. Each result carries a
  visible "AI-generated" badge.

Face data is NOT used for marketing, advertising, behavioral
profiling, model training, recommendations, or analytics. We do not
sell face data.

Third parties that receive face data:
- xAI Grok Imagine API (full-body / waist-up photos only)
- AWS S3 (storage, in a private bucket with Block Public Access)
That is the complete list.

Storage: private AWS S3 bucket in the United States. Access only via
short-lived presigned URLs minted server-side per request.

Retention: photos and AI results persist until the user deletes them
in Settings or deletes their account. On account deletion, all face
data is removed from the database and S3 within 30 days. No automatic
expiration. Documented in Privacy Policy §4 (Face Data) and §6 (Data
Retention).

Privacy Policy: face data treatment is documented explicitly in §4
("Face Data") of https://evofaceflow.com/privacy.html, with supporting
detail in §3 (AI Processing of Body Photos), §5 (How We Share
Information), §6 (Data Retention), and §7 (Your Rights).

USER-GENERATED CONTENT (Guideline 1.2)
The Discover feed shows public try-on results.
- Three-dot menu on every feed card: Report Post / Report User / Block.
- Profile screens: Report User / Block User.
- Reports use a bottom sheet with 6 reasons (Inappropriate, Harassment,
  Impersonation, Spam, Copyright, Other) + optional free-text. Reviewed
  within 24 hours; admins can remove content.
- Blocking is mutual: blocked users also cannot see the blocker.
- Settings > Privacy & Data > Blocked Users allows unblocking.
- xAI content filters block prohibited generations; ToS prohibits
  objectionable uploads; users can mark individual results as private.

CONTACT
support@evofaceflow.com (technical) / privacy@evofaceflow.com (privacy)
Bruhn Freeman — +1-443-610-8379. Reply within one business day.

Thank you,
Bruhn
