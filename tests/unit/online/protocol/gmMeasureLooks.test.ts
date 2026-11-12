import { describe, expect, it } from 'vitest';
import { MEASURE_EFFECTS } from '../../../../src/app/measure/measureEffects';
import { MAX_AURA } from '../../../../src/app/measure/measureTypes';
import { MAX_AREA_CORNERS } from '../../../../src/app/lighting/lightArea';
import { MARK_EFFECTS, MAX_AURA_REACH, MAX_LIGHT_AREA_NUMBERS, parseGmMessage, parseSight, type FullMeasure, type SharedLight } from '../../../../src/app/online/protocol/index.ts';

const TOKEN = '0123456789abcdef01234567';
const circle = { shape: 'circle', pts: [0, 0, 70, 0] };
const older = { color: '#66ffa9', live: null, kept: [] };
const marks = (kept: readonly unknown[], live: unknown = null): object => ({ t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', ...older, full: { live, kept } }] });

/** The kept measurements a page reads of the GM's, or null when it refuses the message. */
function read(...kept: unknown[]): readonly FullMeasure[] | null {
  const parsed = parseGmMessage(marks(kept));
  return parsed?.t === 'marks' ? (parsed.measures[0]?.full?.kept ?? null) : null;
}

describe('what only the GM\'s measurements have', () => {
  it('is read: a colour of its own on any shape, an effect on an area, an aura on a circle', () => {
    const aura = { ...circle, color: '#7852ee', effect: 'mist', aura: { token: TOKEN, reach: 30 } };
    const cone = { shape: 'cone', pts: [0, 0, 0, 70], free: true, color: '#EC7500', effect: 'fire' };
    const ruler = { shape: 'ruler', pts: [0, 0, 70, 0, 70, 70], color: '#ffffff' };
    expect(read(aura, cone, ruler)).toEqual([aura, cone, ruler]);
    expect(parseGmMessage(marks([], { ...circle, color: '#086ddd' }))).toMatchObject({ measures: [{ full: { live: { color: '#086ddd' } } }] });
  });

  it('names every look Atlas draws, and no other', () => {
    expect([...MARK_EFFECTS]).toEqual([...MEASURE_EFFECTS]);
    for (const effect of MARK_EFFECTS) expect(read({ ...circle, effect })).toEqual([{ ...circle, effect }]);
  });

  it('reads a look it does not know by name as none: the area keeps its plain body', () => {
    expect(read({ ...circle, effect: 'acid', color: '#00ff00' })).toEqual([{ ...circle, color: '#00ff00' }]);
    expect(read({ ...circle, effect: 'holy-water' })).toEqual([circle]);
  });

  it('holds an aura\'s reach to what Atlas keeps', () => {
    expect(MAX_AURA_REACH).toBe(MAX_AURA);
    expect(read({ ...circle, aura: { token: TOKEN, reach: MAX_AURA_REACH } })).not.toBeNull();
  });

  it('refuses the whole message for one that is malformed', () => {
    const bad: unknown[] = [
      { ...circle, color: 'red' }, { ...circle, color: '#fff' }, { ...circle, color: 0xff0000 }, { ...circle, color: null }, { ...circle, color: '#12345g' },
      { ...circle, effect: 7 }, { ...circle, effect: null }, { ...circle, effect: '' }, { ...circle, effect: 'Fire' }, { ...circle, effect: 'x'.repeat(33) }, { ...circle, effect: { name: 'fire' } },
      { shape: 'ruler', pts: [0, 0, 70, 0], effect: 'fire' },
      { ...circle, aura: null }, { ...circle, aura: TOKEN }, { ...circle, aura: { token: TOKEN } }, { ...circle, aura: { reach: 30 } },
      { ...circle, aura: { token: 'hero', reach: 30 } }, { ...circle, aura: { token: TOKEN.toUpperCase(), reach: 30 } }, { ...circle, aura: { token: 7, reach: 30 } },
      { ...circle, aura: { token: TOKEN, reach: 0 } }, { ...circle, aura: { token: TOKEN, reach: -5 } }, { ...circle, aura: { token: TOKEN, reach: MAX_AURA_REACH + 1 } },
      { ...circle, aura: { token: TOKEN, reach: Number.NaN } }, { ...circle, aura: { token: TOKEN, reach: '30' } }, { ...circle, aura: { token: TOKEN, reach: Number.POSITIVE_INFINITY } },
      { shape: 'cone', pts: [0, 0, 70, 0], aura: { token: TOKEN, reach: 30 } }, { shape: 'square', pts: [0, 0, 70, 0], aura: { token: TOKEN, reach: 30 } },
      { shape: 'ruler', pts: [0, 0, 70, 0], aura: { token: TOKEN, reach: 30 } },
    ];
    for (const measure of bad) {
      expect(read(measure), JSON.stringify(measure)).toBeNull();
      expect(parseGmMessage(marks([], measure)), JSON.stringify(measure)).toBeNull();
    }
  });

  it('keeps nothing else of an aura than its token and its reach', () => {
    expect(read({ ...circle, aura: { token: TOKEN, reach: 12.5, light: { bright: 10, dim: 20 }, owner: 'ana' } })).toEqual([{ ...circle, aura: { token: TOKEN, reach: 12.5 } }]);
  });
});

describe('a light of the scene that glows from an area or rides a token', () => {
  const emission = { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'none' };
  const light = { id: TOKEN, x: 100, y: 100, emission };
  const sight = (lights: readonly unknown[]): Record<string, unknown> => ({ lighting: { enabled: true, ambient: 0 }, lights, tokens: [], held: [] });
  const lightsOf = (...lights: unknown[]): readonly SharedLight[] | null => parseSight(sight(lights))?.lights ?? null;

  it('is read with its outline and its token, and as it always was without them', () => {
    const square = { ...light, area: [0, 0, 200, 0, 200, 200, 0, 200] };
    const riding = { ...light, token: 'f'.repeat(24) };
    expect(lightsOf(light, square, riding)).toEqual([light, square, riding]);
  });

  it('holds as many corners as Atlas reads of an area light', () => {
    expect(MAX_LIGHT_AREA_NUMBERS).toBe(2 * MAX_AREA_CORNERS);
    expect(lightsOf({ ...light, area: Array.from({ length: MAX_LIGHT_AREA_NUMBERS }, (_, index) => index) })).not.toBeNull();
  });

  it('refuses the whole message for one that is malformed', () => {
    const bad: unknown[] = [
      { ...light, area: [] }, { ...light, area: [0, 0, 10, 0] }, { ...light, area: [0, 0, 10, 0, 10, 10, 5] }, { ...light, area: [0, 0, 10, 0, 10, Number.NaN] },
      { ...light, area: [0, 0, 10, 0, 10, 2e6] }, { ...light, area: [0, 0, 10, 0, 10, '10'] }, { ...light, area: 'all' }, { ...light, area: null },
      { ...light, area: Array.from({ length: MAX_LIGHT_AREA_NUMBERS + 2 }, (_, index) => index) },
      { ...light, token: 'hero' }, { ...light, token: 7 }, { ...light, token: null }, { ...light, token: TOKEN.toUpperCase() },
    ];
    for (const entry of bad) expect(lightsOf(entry), JSON.stringify(entry)).toBeNull();
  });
});
