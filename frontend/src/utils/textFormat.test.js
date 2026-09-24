import { describe, expect, it } from 'vitest';
import { toNameCase } from './textFormat.js';

describe('toNameCase', () => {
  it('capitalizes a lowercase name', () => {
    expect(toNameCase('angelo')).toBe('Angelo');
  });

  it('normalizes an ALL-CAPS name to a single leading capital', () => {
    expect(toNameCase('ANGELO')).toBe('Angelo');
  });

  it('leaves an already-correct name unchanged', () => {
    expect(toNameCase('Angelo')).toBe('Angelo');
  });

  it('capitalizes each word of a multi-word name', () => {
    expect(toNameCase('juan dela cruz')).toBe('Juan Dela Cruz');
  });

  it('capitalizes after a hyphen', () => {
    expect(toNameCase('mary-ann')).toBe('Mary-Ann');
  });

  it('capitalizes after a period', () => {
    expect(toNameCase('st. john')).toBe('St. John');
  });

  it('does not touch digits or symbols — normalization alone does not make an invalid name valid', () => {
    expect(toNameCase('angelo123')).toBe('Angelo123');
    expect(toNameCase('1angelo')).toBe('1angelo');
    expect(toNameCase('angelo!')).toBe('Angelo!');
  });

  it('passes through empty input unchanged', () => {
    expect(toNameCase('')).toBe('');
  });
});
