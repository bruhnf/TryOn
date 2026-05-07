import fs from 'fs';
import path from 'path';
import {
  Environment,
  SignedDataVerifier,
  ResponseBodyV2DecodedPayload,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
} from '@apple/app-store-server-library';
import { env } from '../config/env';
import { createChildLogger } from './logger';

const log = createChildLogger('AppleNotificationService');

let cachedVerifier: SignedDataVerifier | null = null;

function loadAppleRootCerts(): Buffer[] {
  const dir = path.resolve(env.apple.rootCertsDir);
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Apple root cert dir not found: ${dir}. Download Apple root CAs from https://www.apple.com/certificateauthority/ (at minimum AppleRootCA-G3.cer) and place .cer files in this directory.`,
    );
  }
  const certs = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.cer') || f.toLowerCase().endsWith('.der'))
    .map((f) => fs.readFileSync(path.join(dir, f)));
  if (certs.length === 0) {
    throw new Error(`No Apple root certs (.cer/.der) found in ${dir}`);
  }
  return certs;
}

function getEnvironment(): Environment {
  return env.apple.environment === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
}

export function getVerifier(): SignedDataVerifier {
  if (cachedVerifier) return cachedVerifier;
  const roots = loadAppleRootCerts();
  cachedVerifier = new SignedDataVerifier(
    roots,
    true, // enableOnlineChecks — verify cert revocation against Apple
    getEnvironment(),
    env.apple.bundleId,
    env.apple.appAppleId || undefined,
  );
  log.info('Apple SignedDataVerifier initialized', {
    environment: env.apple.environment,
    bundleId: env.apple.bundleId,
    rootCertCount: roots.length,
  });
  return cachedVerifier;
}

export async function verifyAndDecodeNotification(
  signedPayload: string,
): Promise<ResponseBodyV2DecodedPayload> {
  return getVerifier().verifyAndDecodeNotification(signedPayload);
}

export async function verifyAndDecodeTransaction(
  signedTransactionInfo: string,
): Promise<JWSTransactionDecodedPayload> {
  return getVerifier().verifyAndDecodeTransaction(signedTransactionInfo);
}

export async function verifyAndDecodeRenewalInfo(
  signedRenewalInfo: string,
): Promise<JWSRenewalInfoDecodedPayload> {
  return getVerifier().verifyAndDecodeRenewalInfo(signedRenewalInfo);
}
