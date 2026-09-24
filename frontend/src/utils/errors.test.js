import { describe, expect, it } from 'vitest';
import { describeApiError } from './errors.js';

describe('describeApiError', () => {
  it('falls back to a generic message when the error has none', () => {
    expect(describeApiError(undefined)).toEqual({ message: 'Something went wrong. Please try again.', code: undefined, fieldErrors: {}, details: undefined });
  });

  it('uses the error message when present', () => {
    expect(describeApiError({ message: 'Invalid credentials' })).toEqual({
      message: 'Invalid credentials',
      code: undefined,
      fieldErrors: {},
      details: undefined,
    });
  });

  it('surfaces the error code alongside the message', () => {
    expect(describeApiError({ message: 'Please verify your email address before logging in.', code: 'EMAIL_NOT_VERIFIED' })).toEqual({
      message: 'Please verify your email address before logging in.',
      code: 'EMAIL_NOT_VERIFIED',
      fieldErrors: {},
      details: undefined,
    });
  });

  it('collects field-level details into a lookup map', () => {
    const err = {
      message: 'Validation failed',
      details: [
        { field: 'email', message: 'Must be a valid @gmail.com address' },
        { field: 'phone', message: 'Must be 09XXXXXXXXX' },
      ],
    };
    expect(describeApiError(err)).toEqual({
      message: 'Validation failed',
      code: undefined,
      fieldErrors: {
        email: 'Must be a valid @gmail.com address',
        phone: 'Must be 09XXXXXXXXX',
      },
      details: err.details,
    });
  });

  it('ignores a non-array details field for fieldErrors, but still passes it through as details', () => {
    expect(describeApiError({ message: 'oops', details: 'not-an-array' })).toEqual({
      message: 'oops',
      code: undefined,
      fieldErrors: {},
      details: 'not-an-array',
    });
  });
});
