import crypto from 'crypto';

/** Generate a secure random token (hex string) */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Generate a wallet signing nonce message */
export function generateNonce(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  return `Sign this message to verify your wallet ownership for NovaPay.\n\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}
