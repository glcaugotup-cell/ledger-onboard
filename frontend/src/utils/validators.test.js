import { describe, expect, it } from 'vitest';
import {
  getPasswordChecklist,
  getPasswordStrength,
  normalizePhToE164,
  sanitizePhoneInput,
  validateGmail,
  validateName,
  validatePassword,
  validatePhone,
} from './validators.js';

describe('validateName', () => {
  it('requires a value', () => {
    expect(validateName('')).toBe('This field is required');
  });

  it('rejects a lowercase first letter', () => {
    expect(validateName('juan')).toMatch(/uppercase/);
  });

  it('rejects digits', () => {
    expect(validateName('Juan123')).toMatch(/uppercase/);
  });

  it('accepts letters, spaces, hyphens, and periods', () => {
    expect(validateName('Dela Cruz-Santos')).toBeNull();
    expect(validateName('St. James')).toBeNull();
  });
});

describe('validateGmail', () => {
  it('requires a value', () => {
    expect(validateGmail('')).toBe('Email is required');
  });

  it('rejects non-gmail addresses', () => {
    expect(validateGmail('juan@yahoo.com')).toMatch(/gmail\.com/);
  });

  it('rejects malformed addresses', () => {
    expect(validateGmail('not-an-email')).toMatch(/gmail\.com/);
  });

  it('accepts a valid gmail address', () => {
    expect(validateGmail('juan.delacruz+demo@gmail.com')).toBeNull();
  });
});

describe('validatePhone', () => {
  it('requires a value', () => {
    expect(validatePhone('')).toBe('Phone number is required');
  });

  it('accepts the 09XXXXXXXXX format', () => {
    expect(validatePhone('09171234567')).toBeNull();
  });

  it('accepts the +639XXXXXXXXX format', () => {
    expect(validatePhone('+639171234567')).toBeNull();
  });

  it('rejects the wrong number of digits', () => {
    expect(validatePhone('0917123456')).toMatch(/09XXXXXXXXX/);
  });

  it('rejects a foreign prefix', () => {
    expect(validatePhone('+15551234567')).toMatch(/09XXXXXXXXX/);
  });
});

describe('sanitizePhoneInput', () => {
  it('strips letters and symbols other than a leading plus', () => {
    expect(sanitizePhoneInput('09a17-1b23c4567')).toBe('09171234567');
  });

  it('keeps only a single leading plus', () => {
    expect(sanitizePhoneInput('+63+9171234567')).toBe('+639171234567');
  });

  it('drops a plus that is not in the leading position', () => {
    expect(sanitizePhoneInput('0917+1234567')).toBe('09171234567');
  });

  it('passes digit-only input through unchanged', () => {
    expect(sanitizePhoneInput('09171234567')).toBe('09171234567');
  });
});

describe('normalizePhToE164', () => {
  it('normalizes a leading-0 number to +63', () => {
    expect(normalizePhToE164('09235753673')).toBe('+639235753673');
  });

  it('normalizes a bare 10-digit number to +63', () => {
    expect(normalizePhToE164('9235753673')).toBe('+639235753673');
  });

  it('leaves an already-correct +63 number unchanged, never doubling the prefix', () => {
    expect(normalizePhToE164('+639235753673')).toBe('+639235753673');
  });

  it('strips spaces from the suggested display format before normalizing', () => {
    expect(normalizePhToE164('+63 923 575 3673')).toBe('+639235753673');
  });

  it('leaves an incomplete number unchanged so validation can flag it', () => {
    expect(normalizePhToE164('0923575367')).toBe('0923575367');
  });

  it('passes through empty input unchanged', () => {
    expect(normalizePhToE164('')).toBe('');
  });
});

describe('getPasswordChecklist', () => {
  it('flags every requirement as unmet for an empty password', () => {
    const checklist = getPasswordChecklist('');
    expect(checklist.every((req) => req.met === false)).toBe(true);
  });

  it('flags every requirement as met for a strong password', () => {
    const checklist = getPasswordChecklist('Str0ng!Pass');
    expect(checklist.every((req) => req.met === true)).toBe(true);
  });

  it('flags only the missing requirements', () => {
    const checklist = getPasswordChecklist('lowercase123');
    const byKey = Object.fromEntries(checklist.map((r) => [r.key, r.met]));
    expect(byKey).toEqual({
      length: true,
      upper: false,
      lower: true,
      number: true,
      special: false,
    });
  });
});

describe('validatePassword', () => {
  it('requires a value', () => {
    expect(validatePassword('')).toBe('Password is required');
  });

  it('rejects a password missing requirements', () => {
    expect(validatePassword('weak')).toMatch(/^Password needs /);
  });

  it('accepts a password meeting every requirement', () => {
    expect(validatePassword('Str0ng!Pass')).toBeNull();
  });
});

describe('getPasswordStrength', () => {
  it('gives no rating for an empty password', () => {
    expect(getPasswordStrength('')).toEqual({ score: 0, level: null, label: '—', segments: 0 });
  });

  it.each([
    ['a', 1, 'weak', 1],
    ['abcdefgh', 2, 'fair', 2],
    ['abcdefg1', 3, 'good', 3],
    ['Abcdefg1', 4, 'good', 3],
    ['Angelo@calaycay66', 5, 'strong', 4],
  ])('%s → score %i, %s, %i segments', (pw, score, level, segments) => {
    expect(getPasswordStrength(pw)).toMatchObject({ score, level, segments });
  });

  it('only rates Strong when validatePassword also passes', () => {
    expect(validatePassword('Angelo@calaycay66')).toBeNull();
    expect(getPasswordStrength('Abcdefg1').level).not.toBe('strong');
    expect(validatePassword('Abcdefg1')).not.toBeNull();
  });
});

describe('validatePassword — names the missing requirements', () => {
  it.each([
    ['Abcdefg1', 'Password needs a special character'],
    ['abc', 'Password needs at least 8 characters, an uppercase letter, a number and a special character'],
  ])('%s → %s', (pw, msg) => {
    expect(validatePassword(pw)).toBe(msg);
  });
});
