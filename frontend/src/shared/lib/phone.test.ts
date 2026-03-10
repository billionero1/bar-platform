import { describe, expect, it } from 'vitest';

import { formatPhone, phoneDigits, toApiWithPlus } from './phone';

describe('phone utils', () => {
  it('normalizes phone to 11 digits with leading 7', () => {
    expect(phoneDigits('8 (925) 111-22-33')).toBe('79251112233');
    expect(phoneDigits('+7 925 111 22 33')).toBe('79251112233');
    expect(phoneDigits('9251112233')).toBe('79251112233');
  });

  it('builds api format with plus', () => {
    expect(toApiWithPlus('89251112233')).toBe('+79251112233');
  });

  it('formats phone for ui', () => {
    expect(formatPhone('79251112233')).toBe('+7 (925) 111 22 33');
  });
});
