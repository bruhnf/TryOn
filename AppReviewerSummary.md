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
