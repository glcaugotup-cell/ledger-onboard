const { normalizePhToE164 } = require('./phoneFormat');

/**
 * Admins may have a mobile number from one of these countries; everyone else stays on
 * Philippine numbers. `national` is the mobile number without the country code or a leading 0.
 * Every number fits the User model's 13-character limit. Mirrored in frontend/src/data/adminPhoneCountries.js.
 */
const ADMIN_PHONE_COUNTRIES = [
  { code: 'PH', name: 'Philippines', dial: '63', national: /^9\d{9}$/ },
  { code: 'US', name: 'United States / Canada', dial: '1', national: /^[2-9]\d{9}$/ },
  { code: 'GB', name: 'United Kingdom', dial: '44', national: /^7\d{9}$/ },
  { code: 'AU', name: 'Australia', dial: '61', national: /^4\d{8}$/ },
  { code: 'SG', name: 'Singapore', dial: '65', national: /^[89]\d{7}$/ },
  { code: 'HK', name: 'Hong Kong', dial: '852', national: /^[4-9]\d{7}$/ },
  { code: 'JP', name: 'Japan', dial: '81', national: /^[789]0\d{8}$/ },
  { code: 'KR', name: 'South Korea', dial: '82', national: /^1\d{8,9}$/ },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', national: /^5\d{8}$/ },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', national: /^5\d{8}$/ },
];

const ADMIN_PHONE_MESSAGE = 'Phone must be a valid mobile number for the chosen country';

/** "+44 7400-123456" -> "+447400123456"; Philippine local forms ("0917…") -> "+63917…". */
function normalizeAdminPhone(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (!raw.startsWith('+')) return normalizePhToE164(raw);
  return `+${raw.replace(/\D/g, '')}`;
}

/** True for "+<country code><mobile number>" from the list above. */
function isValidAdminPhone(value) {
  if (typeof value !== 'string' || !value.startsWith('+')) return false;
  const digits = value.slice(1);
  return ADMIN_PHONE_COUNTRIES.some((c) => digits.startsWith(c.dial) && c.national.test(digits.slice(c.dial.length)));
}

module.exports = { ADMIN_PHONE_COUNTRIES, ADMIN_PHONE_MESSAGE, normalizeAdminPhone, isValidAdminPhone };
