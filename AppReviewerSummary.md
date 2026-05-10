Thank you for reviewing TryOn.

OVERVIEW
TryOn is an AI-powered virtual clothing try-on app. Users upload up to three
photos of themselves (full-body, waist-up, and a close-up profile photo), then
photograph clothing items they want to try on. The app sends the body and
clothing photos to xAI's Grok Imagine API and shows the user wearing the
clothing in their own perspective. The close-up photo is used only as a
profile picture and is never sent to AI services.

SIGN IN — DEMO ACCOUNTS
Two demo accounts are provided so you can test both single-user flows and the
peer flows that require a second account (follow, block, report). The Login
screen takes EMAIL (not username) — paste the email shown below into the
"Email" field.

Primary demo account
  Email:    testuser1@evofaceflow.com
  Password: 0e99752ceb71
  Username (as displayed in the app): testuser1
  Verified, body photos pre-loaded, 25 credits available, BASIC subscription
  tier active. Use this for the core try-on flow, subscription management,
  and credit purchases.

Secondary demo account
  Email:    testuser2@evofaceflow.com
  Password: 6db0d3d6aa99
  Username (as displayed in the app): testuser2
  Verified peer account. Use this from a second device or in a second session
  to test the follow / unfollow, block / unblock, and report flows from
  testuser1's perspective and back.

Both sets of credentials are also entered in the demo-account fields in App
Store Connect.

CORE FEATURE WALKTHROUGH (signed in as testuser1)
1. Tap the camera icon (TryOn) in the bottom tab bar.
2. Tap "Add Clothing Photo" and select any image from the photo library, or
   take a photo of a garment.
3. Tap "Generate Try-On". An AI-generated image is produced in 10-30 seconds.
4. The result appears with a clear "AI-generated" disclosure pill on every
   surface where the image is shown (feed card, detail modal, full-screen
   viewer), per Guideline 4.0.

NAVIGATION
The bottom tab bar has five tabs: Home (Discover feed) | Friends (search +
follow lists) | TryOn (centered camera FAB) | Inbox (notifications) | Profile.
Settings, Edit Profile, and the Purchase screen are reached as modals.

IN-APP PURCHASES
The app uses StoreKit V2 with App Store Server Notifications V2 for
subscription and consumable purchases:
- Two auto-renewing subscriptions (Basic $9.99/month, Premium $19.99/month).
- Twelve consumable credit packs: 4 sizes (10, 25, 50, 100 credits) × 3 tier
  variants (FREE / BASIC / PREMIUM). Every variant of the same size grants
  the same number of credits — only the price differs. The client offers
  only the variant matching the user's current subscription tier, so Premium
  members see the lowest per-credit price and Free users see the highest.

Subscription benefits:
- BASIC: 12 try-on sessions per rolling 7-day window included; reduced
  per-credit pricing on top-up packs.
- PREMIUM: 24 try-on sessions per rolling 7-day window included; lowest
  per-credit pricing.
- FREE: 10 credits granted once at email verification; additional usage
  requires either purchasing credit packs or upgrading to a subscription.

To test purchases:
1. Tap the credits indicator in the upper-left corner of the Home screen
   (or the camera badge from any other tab) to open "Get More Try-Ons".
2. Switch between "Tiers" and "Buy Credits" tabs.
3. Each subscribe button shows the localized price fetched from the App
   Store and an auto-renewal disclosure adjacent to the button (per
   Guideline 3.1.2(a)). Each "Buy Credits" card shows both the pack price
   and the per-credit price computed from the StoreKit-reported amount.
4. The "Restore Purchases" button is available on this screen and in
   Settings.
5. The "Manage Subscription" link opens iOS Settings > Apple ID >
   Subscriptions.

Entitlement is granted only after Apple-signed receipt verification on the
backend (verify-receipt fast path plus App Store Server Notifications V2
webhook as the authoritative source). The app never grants tier or credits
client-side.

PRIVACY
- Privacy Policy: https://evofaceflow.com/privacy.html
- Terms of Service: https://evofaceflow.com/terms.html
Both are also linked from the Settings screen, the Sign-Up consent checkbox,
and the subscription disclosure on the purchase screen.

User data controls available in Settings > Privacy & Data:
- "Delete All Body Photos" removes uploaded body photos and AI-generated
  derivatives from our servers.
- "Export My Data (GDPR/CCPA)" downloads a JSON file containing the user's
  profile, try-on history, location records, credit transactions, and Apple
  receipts.
- "Blocked Users" lists every account the signed-in user has blocked and
  allows unblocking.
- "Delete Account" permanently deletes the account and all associated data.

THIRD-PARTY DATA PROCESSING
Body and clothing photos used in try-on are sent to xAI Grok Imagine for
generation. This is disclosed in the Privacy Policy section 3 and consented
to via the Sign-Up checkbox and onboarding consent text. Photos and
generated images are stored in a private S3 bucket; the app fetches them
through short-lived presigned URLs minted server-side on each request — no
direct public bucket access.

USER-GENERATED CONTENT
The Discover feed shows public try-on results from other users. Moderation
controls (per Guideline 1.2):
- Every feed card has a three-dot menu with "Report Post", "Report User",
  and "Block User" actions.
- Profile screens have a three-dot menu with "Report User" and "Block User".
- Reports use a bottom sheet with six structured reasons (Inappropriate,
  Harassment, Impersonation, Spam, Copyright, Other) plus optional free-text.
  Submitted reports are reviewed within 24 hours by an admin and can be
  resolved with content removal.
- Blocking hides the blocked user's content from the blocker AND prevents
  the blocked user from seeing the blocker's content (mutual invisibility).
- Settings > Privacy & Data > Blocked Users lists every blocked account and
  allows unblocking.
- Try-on results are AI-generated; xAI's content filters block obviously
  prohibited generation. The Terms of Service prohibits objectionable
  uploads. Reported content can be made private or removed by admins.
- Users can mark individual try-on results as private from the detail view.

CONTACT
Technical issues during review: support@evofaceflow.com
Privacy questions: privacy@evofaceflow.com
We monitor both addresses and respond within one business day.

Thank you again for your time.
