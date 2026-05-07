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

export const env = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '30d',

  adminApiKey: required('ADMIN_API_KEY'),
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
