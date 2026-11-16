import { describe, expect, it } from 'vitest';
import { LIGHT_GLYPH_PATHS } from '../../../lighting/lightGlyphs';
import { LIGHT_KINDS, LIGHT_PRESETS, lightKindOf } from '../../../lighting/lightPresets';
import type { LightKind, LightSource } from '../../../types/lightingTypes';
import { PIN_ICON_PATHS } from '../../../types/pinIcons';
import { contrast, lightColorNumber, lightMarkerAt, lightMarkerLook, readableTint, type LightMarkerTheme } from '../lightMarker';

const DARK: LightMarkerTheme = { background: 0x2a2a2a, stroke: 0xffffff, accent: 0x8a5cf5 };
const LIGHT: LightMarkerTheme = { background: 0xe3e3e3, stroke: 0x000000, accent: 0x705dcf };
const REST = { hovered: false, selected: false, dragging: false };

function light(overrides: Partial<LightSource> = {}): LightSource {
  return { id: 'a', kind: 'light', x: 0, y: 0, emission: LIGHT_PRESETS.torch.emission, ...overrides };
}

describe('light kinds', () => {
  it('has a glyph of its own for every kind, none of them offered as a pin except the shared torch', () => {
    const pinPaths = new Set<string>(Object.values(PIN_ICON_PATHS));
    for (const kind of LIGHT_KINDS) {
      // Silhouettes from game-icons.net are long paths; the crescent of darkness is Atlas' own, two arcs.
      expect(LIGHT_GLYPH_PATHS[kind].length).toBeGreaterThan(kind === 'darkness' ? 40 : 100);
      expect(pinPaths.has(LIGHT_GLYPH_PATHS[kind])).toBe(kind === 'torch');
    }
    // And one for an area light's glowing surface.
    expect(pinPaths.has(LIGHT_GLYPH_PATHS.surface)).toBe(false);
    expect(new Set(Object.values(LIGHT_GLYPH_PATHS)).size).toBe(LIGHT_KINDS.length + 1);
  });

  it('reads the kind a light was given', () => {
    expect(lightKindOf({ ...LIGHT_PRESETS.torch.emission, kind: 'lantern' })).toBe('lantern');
    expect(lightKindOf({ ...LIGHT_PRESETS.torch.emission, bright: 3, kind: 'torch' })).toBe('torch');
  });

  it('reads a light without a kind by the preset it equals, else as custom', () => {
    expect(lightKindOf(LIGHT_PRESETS.candle.emission)).toBe('candle');
    expect(lightKindOf({ ...LIGHT_PRESETS.candle.emission, dim: 99 })).toBe('custom');
  });

  it('reads a kind it does not know, as a newer version or a hand-edited file may store, like no kind', () => {
    const unknown = 'brazier' as LightKind;
    expect(lightKindOf({ ...LIGHT_PRESETS.candle.emission, kind: unknown })).toBe('candle');
    expect(lightKindOf({ ...LIGHT_PRESETS.candle.emission, dim: 99, kind: unknown })).toBe('custom');
    expect(lightKindOf({ ...LIGHT_PRESETS.candle.emission, kind: 'toString' as LightKind })).toBe('candle');
  });
});

describe('lightMarkerLook', () => {
  it('shows the glyph of the light\'s kind', () => {
    for (const kind of LIGHT_KINDS) {
      expect(lightMarkerLook(light({ emission: { ...LIGHT_PRESETS.torch.emission, kind } }), REST, DARK).kind).toBe(kind);
    }
  });

  it('tints glyph and ring in the light\'s colour on the dark badge', () => {
    const look = lightMarkerLook(light({ emission: { ...LIGHT_PRESETS.torch.emission, color: '#ff9a3c' } }), REST, DARK);
    expect(look.glyphTint).toBe(0xff9a3c);
    expect(look.ringColor).toBe(0xff9a3c);
    expect(look.glyphAlpha).toBe(1);
    expect(look.accent).toBeNull();
    expect(look.lift).toBe(1);
  });

  it('deepens a pale colour on the light badge until it reads, keeping its hue', () => {
    const pale = lightColorNumber('#ffd28a');
    expect(contrast(pale, LIGHT.background)).toBeLessThan(3);
    const look = lightMarkerLook(light({ emission: { ...LIGHT_PRESETS.lantern.emission, color: '#ffd28a' } }), REST, LIGHT);
    expect(contrast(look.glyphTint, LIGHT.background)).toBeGreaterThanOrEqual(3);
    const [r, g, b] = [(look.glyphTint >> 16) & 0xff, (look.glyphTint >> 8) & 0xff, look.glyphTint & 0xff];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('lifts a colour too dark for the dark badge', () => {
    expect(contrast(readableTint(0x200000, DARK.background), DARK.background)).toBeGreaterThanOrEqual(3);
  });

  it('dims a switched-off light: its glyph in the badge\'s ink, its ring faint', () => {
    const on = lightMarkerLook(light(), REST, DARK);
    const off = lightMarkerLook(light({ hidden: true }), REST, DARK);
    expect(off.glyphTint).toBe(DARK.stroke);
    expect(off.glyphAlpha).toBeLessThan(0.5);
    expect(off.ringAlpha).toBeLessThan(on.ringAlpha / 2);
    expect(off.ringColor).toBe(on.ringColor);
  });

  it('rings a selected marker in the theme\'s accent', () => {
    expect(lightMarkerLook(light(), { ...REST, selected: true }, DARK).accent).toBe(DARK.accent);
    expect(lightMarkerLook(light(), { ...REST, selected: true }, LIGHT).accent).toBe(LIGHT.accent);
  });

  it('lifts a hovered marker a little and a dragged one more', () => {
    const hovered = lightMarkerLook(light(), { ...REST, hovered: true }, DARK).lift;
    const dragged = lightMarkerLook(light(), { ...REST, hovered: true, dragging: true }, DARK).lift;
    expect(hovered).toBeGreaterThan(1);
    expect(dragged).toBeGreaterThan(hovered);
  });

  it('points the way a light with a beam faces, and nowhere for one that shines all around or a darkness', () => {
    const lantern = { ...LIGHT_PRESETS.lantern.emission, angle: 60 };
    expect(lightMarkerLook(light(), REST, DARK).direction).toBeNull();
    expect(lightMarkerLook(light({ emission: lantern }), REST, DARK).direction).toBeCloseTo(-Math.PI / 2);
    expect(lightMarkerLook(light({ emission: lantern, rotation: 90 }), REST, DARK).direction).toBeCloseTo(0);
    expect(lightMarkerLook(light({ emission: { ...lantern, darkness: true }, rotation: 90 }), REST, DARK).direction).toBeNull();
  });

  it('marks a light that follows the ambient light with a moon, and dims it while the scene is too bright for it', () => {
    const lamp = light({ activeBelowAmbient: 0.5 });
    expect(lightMarkerLook(light(), REST, DARK, 1).moon).toBe(false);
    const asleep = lightMarkerLook(lamp, REST, DARK, 1);
    expect(asleep).toMatchObject({ moon: true, glyphTint: DARK.stroke, glyphAlpha: 0.4, ringAlpha: 0.3 });
    const awake = lightMarkerLook(lamp, REST, DARK, 0.5);
    expect(awake).toMatchObject({ moon: true, glyphAlpha: 1, ringAlpha: 0.9 });
    // Without an ambient level (the look of a light as such) it is drawn awake.
    expect(lightMarkerLook(lamp, REST, DARK).glyphAlpha).toBe(1);
  });

  it('falls back to a warm colour for a colour it cannot read', () => {
    expect(lightColorNumber('tomato')).toBe(0xffcc66);
  });
});

describe('lightMarkerAt', () => {
  const lights = [light({ id: 'a', x: 100, y: 100 }), light({ id: 'b', x: 160, y: 100 })];

  it.each([0.3, 1, 3])('hits a marker within 16 screen pixels at zoom %s', (zoom) => {
    const reach = 16 / zoom;
    expect(lightMarkerAt(lights, { x: 100 - reach * 0.95, y: 100 }, zoom)).toBe('a');
    expect(lightMarkerAt(lights, { x: 100, y: 100 + reach * 0.95 }, zoom)).toBe('a');
    expect(lightMarkerAt(lights, { x: 100 - reach * 1.05, y: 100 }, zoom)).toBeNull();
  });

  it('takes the nearer of two markers that overlap on screen', () => {
    expect(lightMarkerAt(lights, { x: 125, y: 100 }, 0.3)).toBe('a');
    expect(lightMarkerAt(lights, { x: 140, y: 100 }, 0.3)).toBe('b');
  });

  it('grows with the markers when the map is zoomed far out', () => {
    expect(lightMarkerAt(lights, { x: 100, y: 100 + 150 }, 0.1)).toBe('a');
    expect(lightMarkerAt([], { x: 100, y: 100 }, 1)).toBeNull();
  });
});
