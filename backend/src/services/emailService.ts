import nodemailer from 'nodemailer';
import { env } from '../config/env';

function createTransport() {
  // If SMTP not configured, skip email sending
  if (!env.email.smtpHost || !env.email.smtpUser) {
    console.warn('[Email] SMTP not configured - emails will be logged to console only');
    return null;
  }
  return nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpPort === 465,
    auth: { user: env.email.smtpUser, pass: env.email.smtpPass },
  });
}

const transport = createTransport();

async function sendMail(options: { from: string; to: string; subject: string; html: string }) {
  if (!transport) {
    // Log email to console when SMTP not configured
    console.log('\n[Email - NO SMTP]');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Content: ${options.html.replace(/<[^>]*>/g, '')}`);
    console.log('[End Email]\n');
    return;
  }
  await transport.sendMail(options);
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${env.appUrl}/api/auth/verify/${token}`;
  await sendMail({
    from: env.email.fromAddress,
    to,
    subject: 'Verify your TryOn account',
    html: `
      <h2>Welcome to TryOn!</h2>
      <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
      <a href="${url}" style="background:#000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a>
      <p>Or copy this link: ${url}</p>
      <p>If you didn't create a TryOn account, you can safely ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${env.frontendDeepLink}reset-password?token=${token}`;
  await sendMail({
    from: env.email.fromAddress,
    to,
    subject: 'Reset your TryOn password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${url}" style="background:#000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    `,
  });
}

export async function sendSuspiciousLoginAlert(
  to: string,
  city: string,
  country: string,
  timestamp: Date,
): Promise<void> {
  await sendMail({
    from: env.email.fromAddress,
    to,
    subject: 'Unusual login detected on your TryOn account',
    html: `
      <h2>Unusual Login Detected</h2>
      <p>We detected a login to your TryOn account from an unusual location:</p>
      <ul>
        <li><strong>Location:</strong> ${city}, ${country}</li>
        <li><strong>Time:</strong> ${timestamp.toUTCString()}</li>
      </ul>
      <p>If this was you, no action is needed. If you don't recognize this login, please change your password immediately.</p>
    `,
  });
}
