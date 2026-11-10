import { describe, expect, it } from 'vitest';
import { isNewerRelease } from '../../../src/app/changelog/version';

describe('isNewerRelease', () => {
  it.each([
    ['0.8.1', '0.8.0', true],
    ['0.8.1', '0.8.1-beta.0', true],
    ['0.8.1', '0.8.1', false],
    ['0.8.0', '0.8.1-beta.0', false],
    ['0.10.0', '0.9.9', true],
    ['1.0.0', '0.99.99', true],
    ['0.9.0-beta.1', '0.8.0', false],
    ['garbage', '0.8.0', false],
    ['0.9.0', 'garbage', false],
  ])('isNewerRelease(%s, %s) is %s', (candidate, installed, want) => {
    expect(isNewerRelease(candidate, installed)).toBe(want);
  });
});
