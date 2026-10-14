/**
 * Countries an admin's mobile number may come from; everyone else stays on Philippine numbers.
 * `national` is the mobile number without the country code or a leading 0.
 * Mirrors backend/utils/adminPhone.js, which remains the authoritative check.
 */
export const ADMIN_PHONE_COUNTRIES = [
  { code: 'PH', name: 'Philippines', dial: '63', national: /^9\d{9}$/, example: '917 123 4567' },
  { code: 'US', name: 'United States / Canada', dial: '1', national: /^[2-9]\d{9}$/, example: '201 555 0123' },
  { code: 'GB', name: 'United Kingdom', dial: '44', national: /^7\d{9}$/, example: '7400 123456' },
  { code: 'AU', name: 'Australia', dial: '61', national: /^4\d{8}$/, example: '412 345 678' },
  { code: 'SG', name: 'Singapore', dial: '65', national: /^[89]\d{7}$/, example: '8123 4567' },
  { code: 'HK', name: 'Hong Kong', dial: '852', national: /^[4-9]\d{7}$/, example: '5123 4567' },
  { code: 'JP', name: 'Japan', dial: '81', national: /^[789]0\d{8}$/, example: '90 1234 5678' },
  { code: 'KR', name: 'South Korea', dial: '82', national: /^1\d{8,9}$/, example: '10 1234 5678' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', national: /^5\d{8}$/, example: '50 123 4567' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', national: /^5\d{8}$/, example: '51 234 5678' },
];

export const DEFAULT_ADMIN_PHONE_COUNTRY = ADMIN_PHONE_COUNTRIES[0];

/**
 * "+447400123456" -> { country: United Kingdom, national: "7400123456" }. Philippine local forms
 * ("09171234567") count as Philippines. Returns null when no listed country matches.
 */
export function splitAdminPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '').replace(/^0/, '');
    return { country: DEFAULT_ADMIN_PHONE_COUNTRY, national: digits };
  }
  const digits = raw.replace(/\D/g, '');
  // Longest codes first, so "+852…" is never read as another country.
  const byLength = [...ADMIN_PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  const country = byLength.find((c) => digits.startsWith(c.dial));
  return country ? { country, national: digits.slice(country.dial.length) } : null;
}

export function validateAdminPhone(value) {
  if (!value) return 'Phone number is required';
  const parts = splitAdminPhone(value);
  if (!parts || !parts.country.national.test(parts.national)) {
    const country = parts?.country || DEFAULT_ADMIN_PHONE_COUNTRY;
    return `Enter a valid ${country.name} mobile number (e.g. +${country.dial} ${country.example})`;
  }
  return null;
}
