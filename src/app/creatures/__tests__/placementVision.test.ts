import { describe, expect, it } from 'vitest';
import { GENERIC_SENSES } from '../../gameSystems/senses';
import type { TokenVisionDefaults } from '../../types/lightingTypes';
import { placementVision } from '../placementVision';

const darkvision = GENERIC_SENSES.find((sense) => sense.role === 'darkvision')!;

const SENSES: TokenVisionDefaults = { range: 120, angle: 90, senses: [{ id: darkvision.id, range: 30 }] };
const OLD_FIELDS: TokenVisionDefaults = { range: 120, darkvision: 30, tremorsense: 10 };

describe('placementVision', () => {
  it('stamps the whole default, vision off, on a token without a statblock', () => {
    expect(placementVision(SENSES, false)).toEqual({ enabled: false, ...SENSES });
    expect(placementVision(OLD_FIELDS, false)).toEqual({ enabled: false, ...OLD_FIELDS });
  });

  it('leaves the default senses to the statblock of a token that links one, whatever it says today', () => {
    expect(placementVision(SENSES, true)).toEqual({ enabled: false, range: 120, angle: 90 });
    expect(placementVision(OLD_FIELDS, true)).toEqual({ enabled: false, range: 120 });
    expect(placementVision({ range: 60, senses: [] }, true)).toEqual({ enabled: false, range: 60 });
  });

  it('stamps nothing on a linked token when the default holds only senses', () => {
    expect(placementVision({ senses: [{ id: darkvision.id }] }, true)).toBeUndefined();
    expect(placementVision({ darkvision: 60 }, true)).toBeUndefined();
  });

  it('switches vision on for a player character alone', () => {
    for (const linked of [false, true]) {
      expect(placementVision({ range: 120 }, linked)).toEqual({ enabled: false, range: 120 });
      expect(placementVision({ range: 120 }, linked, true)).toEqual({ enabled: true, range: 120 });
    }
    expect(placementVision(SENSES, false, true)).toEqual({ enabled: true, ...SENSES });
    expect(placementVision({ senses: [{ id: darkvision.id }] }, true, true)).toEqual({ enabled: true });
  });

  it('stamps nothing without a default, but for a player character, who sees', () => {
    expect(placementVision(undefined, true)).toBeUndefined();
    expect(placementVision(undefined, false)).toBeUndefined();
    expect(placementVision(undefined, false, true)).toEqual({ enabled: true });
  });
});
