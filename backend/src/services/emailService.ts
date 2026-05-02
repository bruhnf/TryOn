import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { createChildLogger, logExternalCall } from './logger';

const log = createChildLogger('EmailService');

function createTransport() {
  // If SMTP not configured, skip email sending
  if (!env.email.smtpHost || !env.email.smtpUser) {
    log.warn('SMTP not configured - emails will be logged only');
    return null;
  }
  log.info('SMTP transport configured', { host: env.email.smtpHost, port: env.email.smtpPort });
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
    // Log email when SMTP not configured
    log.info('Email (no SMTP)', { 
      to: options.to, 
      subject: options.subject,
      contentPreview: options.html.replace(/<[^>]*>/g, '').substring(0, 100),
    });
    return;
  }
  
  const startTime = Date.now();
  try {
    await transport.sendMail(options);
    logExternalCall('smtp', 'sendMail', {
      durationMs: Date.now() - startTime,
      success: true,
      to: options.to,
      subject: options.subject,
    });
  } catch (err: unknown) {
    logExternalCall('smtp', 'sendMail', {
      durationMs: Date.now() - startTime,
      success: false,
      to: options.to,
      subject: options.subject,
      error: (err as Error).message,
    });
    throw err;
  }
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
