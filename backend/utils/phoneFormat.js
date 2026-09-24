/**
 * Normalizes a Philippine mobile number to +639XXXXXXXXX:
 *   "09171234567" | "9171234567" | "+639171234567" -> "+639171234567"
 * Anything else is returned unchanged so the PH_PHONE check can reject it.
 * Runs as a sanitizer before validation. Mirrored in frontend/src/utils/validators.js.
 */
function normalizePhToE164(value) {
  if (!value) return value;
  const raw = String(value).trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (hasPlus && digits.length === 12 && digits.startsWith('63')) {
    return `+63${digits.slice(2)}`;
  }
  if (!hasPlus && digits.length === 11 && digits.startsWith('0')) {
    return `+63${digits.slice(1)}`;
  }
  if (!hasPlus && digits.length === 10 && digits.startsWith('9')) {
    return `+63${digits}`;
  }
  return raw;
}

module.exports = { normalizePhToE164 };
