import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

// Lightweight email shape check — RFC 5322 has plenty of edge cases, but for an
// admin allowlist sanity check this catches the common typos (missing @, stray
// spaces, trailing commas). Anything that doesn't pass is dropped from the list
// AND announced via console.warn so an operator can see they had a typo.
function parseAdminEmails(raw: string): string[] {
  const entries = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid: string[] = [];
  const dropped: string[] = [];
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const e of entries) {
    if (looksLikeEmail.test(e)) valid.push(e);
    else dropped.push(e);
  }
  if (dropped.length > 0) {
    // env.ts loads before the Winston logger is constructed, so use console
    // directly. The message will appear in container logs at startup.
    // eslint-disable-next-line no-console
    console.warn(
      `[env] ADMIN_EMAILS: dropped ${dropped.length} malformed entr${dropped.length === 1 ? 'y' : 'ies'}: ${dropped.join(', ')}`,
    );
  }
  return valid;
}

export const env = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '30d',

  adminApiKey: required('ADMIN_API_KEY'),
  // Comma-separated list of email addresses with admin UI access in the app.
  // Backend admin routes also require ADMIN_API_KEY; this list controls
  // whether the Admin Console button is even shown in Settings.
  adminEmails: parseAdminEmails(optional('ADMIN_EMAILS', '')),
  allowedOrigins: optional('ALLOWED_ORIGINS', 'http://localhost:8081').split(','),

  aws: {
    accessKeyId: optional('AWS_ACCESS_KEY_ID'),
    secretAccessKey: optional('AWS_SECRET_ACCESS_KEY'),
    region: optional('AWS_REGION', 'us-east-1'),
    s3Bucket: optional('AWS_S3_BUCKET', 'tryon-media'),
  },

  redis: { url: optional('REDIS_URL', 'redis://localhost:6379') },

  grok: {
    apiKey: optional('GROK_API_KEY'),
    apiUrl: optional('GROK_API_URL', 'https://api.x.ai/v1'),
  },

  email: {
    fromAddress: optional('SES_FROM_ADDRESS', 'noreply@evofaceflow.com'),
    smtpHost: optional('SMTP_HOST'),
    smtpPort: parseInt(optional('SMTP_PORT', '587'), 10),
    smtpUser: optional('SMTP_USER'),
    smtpPass: optional('SMTP_PASS'),
  },

  appUrl: optional('APP_URL', 'http://localhost:3000'),
  frontendDeepLink: optional('FRONTEND_DEEP_LINK', 'tryon://'),

  apple: {
    // iOS bundle identifier — must match the receipt's bundleId.
    bundleId: optional('APPLE_BUNDLE_ID', 'com.evofaceflow.tryon.app'),
    // Numeric App Store ID for this app (find in App Store Connect URL).
    appAppleId: parseInt(optional('APPLE_APP_APPLE_ID', '0'), 10),
    // Which Apple environment this server is configured to verify notifications from.
    // "Production" or "Sandbox". Sandbox notifications carry environment="Sandbox" and
    // we only accept those when this is also set to Sandbox (or unset in dev).
    environment: optional('APPLE_ENVIRONMENT', 'Sandbox'),
    // Directory containing Apple's root CA .cer files used for JWS verification.
    // Download from https://www.apple.com/certificateauthority/ — at minimum AppleRootCA-G3.cer.
    rootCertsDir: optional('APPLE_ROOT_CERTS_DIR', './certs/apple'),
  },
};
