/**
 * Mirrors backend/validators/patterns.js for instant feedback while typing.
 * The backend remains the authoritative check.
 */
export const PATTERNS = {
  NAME: /^[A-Z][a-zA-Z\s.-]{1,}$/,
  GMAIL: /^[a-zA-Z0-9._%+-]+@gmail\.com$/,
  PH_PHONE: /^(09\d{9}|\+639\d{9})$/,
  OTP: /^\d{6}$/,
};

export function validateName(value) {
  if (!value) return 'This field is required';
  if (!PATTERNS.NAME.test(value)) {
    return 'Must start with an uppercase letter and contain only letters, spaces, hyphens, or periods (min 2 characters)';
  }
  return null;
}

export function validateGmail(value) {
  if (!value) return 'Email is required';
  if (!PATTERNS.GMAIL.test(value)) return 'Must be a valid @gmail.com address';
  return null;
}

/** Same Gmail rule as registration, with login-specific wording. */
export function validateLoginEmail(value) {
  if (!value) return 'Email is required.';
  if (!PATTERNS.GMAIL.test(value)) return 'Please enter a valid email address.';
  return null;
}

/** Login only requires a non-empty password: older accounts may predate the complexity rules. */
export function validateLoginPassword(value) {
  return value ? null : 'Password is required.';
}

export function validatePhone(value) {
  if (!value) return 'Phone number is required';
  if (!PATTERNS.PH_PHONE.test(value)) return 'Must be 09XXXXXXXXX (11 digits) or +639XXXXXXXXX';
  return null;
}

/** onChange filter: keeps digits plus a single leading "+" (for the +639 format). */
export function sanitizePhoneInput(rawValue) {
  let value = rawValue.replace(/[^\d+]/g, '');
  const hasLeadingPlus = value.startsWith('+');
  value = value.replace(/\+/g, '');
  if (hasLeadingPlus) value = `+${value}`;
  return value;
}

/**
 * Normalizes "09171234567", "9171234567" or "+639171234567" to +639XXXXXXXXX.
 * Anything else is returned unchanged so validatePhone can report it.
 * Mirrored in backend/utils/phoneFormat.js.
 */
export function normalizePhToE164(rawValue) {
  if (!rawValue) return rawValue;
  const raw = rawValue.trim();
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

/** Each requirement individually — the single rule set behind validatePassword() and getPasswordStrength(). */
export function getPasswordChecklist(value = '') {
  return [
    { key: 'length', label: 'At least 8 characters', met: value.length >= 8 },
    { key: 'upper', label: 'One uppercase letter', met: /[A-Z]/.test(value) },
    { key: 'lower', label: 'One lowercase letter', met: /[a-z]/.test(value) },
    { key: 'number', label: 'One number', met: /\d/.test(value) },
    { key: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(value) },
  ];
}

/**
 * Display-only strength rating: one point per requirement met.
 * 0–1 → weak, 2 → fair, 3–4 → good, 5 → strong; empty → no rating.
 */
export function getPasswordStrength(value = '') {
  if (!value) return { score: 0, level: null, label: '—', segments: 0 };
  const score = getPasswordChecklist(value).filter((r) => r.met).length;
  if (score === 5) return { score, level: 'strong', label: 'Strong', segments: 4 };
  if (score >= 3) return { score, level: 'good', label: 'Good', segments: 3 };
  if (score === 2) return { score, level: 'fair', label: 'Fair', segments: 2 };
  return { score, level: 'weak', label: 'Weak', segments: 1 };
}

const MISSING_REQUIREMENT_TEXT = {
  length: 'at least 8 characters',
  upper: 'an uppercase letter',
  lower: 'a lowercase letter',
  number: 'a number',
  special: 'a special character',
};

export function validatePassword(value) {
  if (!value) return 'Password is required';
  const unmet = getPasswordChecklist(value).filter((r) => !r.met);
  if (unmet.length === 0) return null;
  const missing = unmet.map((r) => MISSING_REQUIREMENT_TEXT[r.key]);
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Password needs ${list}`;
}
