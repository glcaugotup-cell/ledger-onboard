import { describe, expect, it } from 'vitest';
import {
  todayInputValue,
  validateImageFile,
  validateMoveInDate,
  validateName,
  validatePassword,
  validatePaymentAmount,
} from './validators.js';
import { capitalizeFirst, toNameCase } from './textFormat.js';
import { formatLastActive, isEligibleForInactivityDeactivation } from './activity.js';

const NOW = new Date('2026-09-26T10:00:00');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const seen = (msAgo) => ({ lastLoginAt: new Date(NOW - msAgo).toISOString(), lastActivityAt: new Date(NOW - msAgo).toISOString() });

describe('names with apostrophes', () => {
  it.each(["O'Connor", "D'Angelo", "Mary Anne O'Neil", 'Juan', 'Mary-Ann', 'St. John'])('accepts %s', (name) => {
    expect(validateName(name)).toBeNull();
  });

  it.each(['J@ne', 'Anne!', 'juan', "'", 'X', 'Ann3'])('still rejects %s', (name) => {
    expect(validateName(name)).not.toBeNull();
  });

  it('name-cases after apostrophes and normalizes typographic apostrophes', () => {
    expect(toNameCase("o'connor")).toBe("O'Connor");
    expect(toNameCase('d’angelo')).toBe("D'Angelo");
    expect(toNameCase("mary anne o'neil")).toBe("Mary Anne O'Neil");
  });
});

describe('live auto-capitalization', () => {
  it('raises only the first letter and leaves the rest as typed', () => {
    expect(capitalizeFirst('juan')).toBe('Juan');
    expect(capitalizeFirst("o'connor")).toBe("O'connor");
    expect(capitalizeFirst('McDonald')).toBe('McDonald');
    expect(capitalizeFirst('  sunshine house')).toBe('  Sunshine house');
    expect(capitalizeFirst('')).toBe('');
    expect(capitalizeFirst('101a')).toBe('101a');
  });
});

describe('passwords must not contain spaces', () => {
  it('reports spaces before any other rule', () => {
    expect(validatePassword('Password 123!')).toBe('Password must not contain spaces.');
    expect(validatePassword(' Password123!')).toBe('Password must not contain spaces.');
    expect(validatePassword('Password123!\t')).toBe('Password must not contain spaces.');
  });

  it('accepts the same password without the space', () => {
    expect(validatePassword('Password123!')).toBeNull();
  });
});

describe('move-in date', () => {
  it('rejects yesterday, accepts today and later', () => {
    expect(todayInputValue(NOW)).toBe('2026-09-26');
    expect(validateMoveInDate('2026-09-25', NOW)).toBe('Move-in date cannot be in the past.');
    expect(validateMoveInDate('2026-09-26', NOW)).toBeNull();
    expect(validateMoveInDate('2026-10-01', NOW)).toBeNull();
    expect(validateMoveInDate('', NOW)).toBe('Choose a move-in date.');
  });
});

describe('payment amount and proof image', () => {
  it('must be positive, at most 2 decimals, and within the balance', () => {
    expect(validatePaymentAmount('', 1000)).toBe('Enter the amount.');
    expect(validatePaymentAmount('0', 1000)).toBe('Amount must be greater than 0.');
    expect(validatePaymentAmount('10.005', 1000)).toBe('Use at most 2 decimal places.');
    expect(validatePaymentAmount('1500', 1000)).toMatch(/cannot be more than the remaining balance/);
    expect(validatePaymentAmount('1000', 1000)).toBeNull();
  });

  it('accepts PNG/JPEG/WebP up to 5 MB only', () => {
    expect(validateImageFile(null, { label: 'a screenshot' })).toBe('Please attach a screenshot.');
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toMatch(/Only PNG, JPEG or WebP/);
    expect(validateImageFile({ type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/5 MB or smaller/);
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
  });
});

describe('activity labels', () => {
  it('describes how long ago the user was active', () => {
    expect(formatLastActive(seen(2 * MINUTE), NOW)).toBe('Active now');
    expect(formatLastActive(seen(20 * MINUTE), NOW)).toBe('Active 20 minutes ago');
    expect(formatLastActive(seen(3 * 60 * MINUTE), NOW)).toBe('Active 3 hours ago');
    expect(formatLastActive(seen(DAY), NOW)).toBe('Active 1 day ago');
    expect(formatLastActive(seen(31 * DAY), NOW)).toBe('Active 1 month ago');
    expect(formatLastActive(seen(400 * DAY), NOW)).toBe('Active 1 year ago');
    expect(formatLastActive({ lastLoginAt: null, lastActivityAt: NOW.toISOString() }, NOW)).toBe('Never active');
  });

  it('flags only non-admin active/archived accounts idle for 60+ days', () => {
    const idle = { role: 'tenant', accountStatus: 'active', ...seen(61 * DAY) };
    expect(isEligibleForInactivityDeactivation(idle, NOW)).toBe(true);
    expect(isEligibleForInactivityDeactivation({ ...idle, accountStatus: 'archived' }, NOW)).toBe(true);
    expect(isEligibleForInactivityDeactivation({ ...idle, ...seen(59 * DAY) }, NOW)).toBe(false);
    expect(isEligibleForInactivityDeactivation({ ...idle, accountStatus: 'suspended' }, NOW)).toBe(false);
    expect(isEligibleForInactivityDeactivation({ ...idle, role: 'admin' }, NOW)).toBe(false);
  });
});
