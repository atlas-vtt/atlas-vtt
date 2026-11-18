import { describe, expect, it } from 'vitest';
import { deviceSupport } from '../../../src/app/platform/deviceSupport';

describe('whether Atlas runs on a device', () => {
  it('does on a tablet or desktop whose web view has what the workers draw on', () => {
    expect(deviceSupport({ isPhone: false, hasOffscreenCanvas: true })).toBe('supported');
  });

  it('does not where the system is too old to have it (iPadOS before 16.4)', () => {
    expect(deviceSupport({ isPhone: false, hasOffscreenCanvas: false })).toBe('old-os');
  });

  it('never on a phone, whatever its system', () => {
    expect(deviceSupport({ isPhone: true, hasOffscreenCanvas: true })).toBe('phone');
    expect(deviceSupport({ isPhone: true, hasOffscreenCanvas: false })).toBe('phone');
  });
});
