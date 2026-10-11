/** Wording and input handling shared by every two-factor code field. */
export const MFA_CODE_PROMPT = 'Enter the 6-digit code from your authenticator app, or a backup code.';

/**
 * Keeps what a code can contain: digits for an app code, or letters, digits and one dash for a
 * backup code (XXXXX-XXXXX). Upper-cased so a typed backup code matches what was shown.
 */
export function cleanMfaCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11);
}

/** A 6-digit authenticator code only (used where a backup code is not accepted). */
export function cleanAppCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

/** "ABCD EFGH IJKL …" — easier to read and type into an app by hand. */
export function groupSecret(secret) {
  return String(secret || '').replace(/(.{4})/g, '$1 ').trim();
}
