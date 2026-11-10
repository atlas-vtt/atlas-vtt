import { describe, expect, it } from 'vitest';
import { choicesOf, GRAPHICS_KNOBS, GRAPHICS_PRESETS, knobsOf, parseGraphicsChoice, presetOf, qualityOf, withKnob } from '../../src/app/lighting/graphicsSettings';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, type TracedQuality } from '../../src/app/lighting/lightingQuality';
import { liquidDetail, liquidFps } from '../../src/app/pixi/liquids/viewLiquids';

describe('the Graphics page\'s choices', () => {
  it('describe each preset exactly as the lighting quality table has it', () => {
    for (const level of LIGHTING_QUALITY_LEVELS) expect(qualityOf(GRAPHICS_PRESETS[level])).toBe(LIGHTING_QUALITY[level]);
    const mix = { ...GRAPHICS_PRESETS.high, liquids: 10 as const };
    expect(qualityOf(mix)).toBe(qualityOf({ ...mix }));
  });

  it('name the preset a set of knobs is, and none for a mix of its own', () => {
    for (const level of LIGHTING_QUALITY_LEVELS) expect(presetOf(GRAPHICS_PRESETS[level])).toBe(level);
    expect(presetOf({ ...GRAPHICS_PRESETS.high, liquids: 10 })).toBeNull();
  });

  it('apply an override over the preset, and drop one set back to the preset\'s own', () => {
    const choice = withKnob({ preset: 'balanced', overrides: {} }, 'litMap', 'sharp');
    expect(choice).toEqual({ preset: 'balanced', overrides: { litMap: 'sharp' } });
    expect(knobsOf(choice).litMap).toBe('sharp');
    expect(qualityOf(knobsOf(choice))).not.toHaveProperty('compositePixelRatio');
    expect(withKnob(choice, 'litMap', 'standard')).toEqual({ preset: 'balanced', overrides: {} });
  });

  it('give the polygon picture no bounce, flicker or rays, whatever those knobs say', () => {
    const quality = qualityOf({ ...GRAPHICS_PRESETS.high, picture: 'polygons' });
    expect(quality).toEqual({ picture: 'polygons', maxTexels: LIGHTING_QUALITY.high.maxTexels, liquidFps: 30 });
  });

  it('read a stored choice back and drop what is no choice', () => {
    expect(parseGraphicsChoice({ preset: 'saver', overrides: { liquids: 30, flames: 'wild', detail: 7 } })).toEqual({ preset: 'saver', overrides: { liquids: 30 } });
    expect(parseGraphicsChoice({ preset: 'ultra' })).toBeNull();
    expect(parseGraphicsChoice('high')).toBeNull();
    expect(parseGraphicsChoice({ preset: 'high' })).toEqual({ preset: 'high', overrides: {} });
    expect(GRAPHICS_KNOBS).toHaveLength(7);
  });

  it('turn every knob into the engine field it names, each value another', () => {
    const traced = (knobs: Partial<typeof GRAPHICS_PRESETS.high>): TracedQuality => qualityOf({ ...GRAPHICS_PRESETS.high, ...knobs }) as TracedQuality;
    expect(choicesOf('detail').map((detail) => traced({ detail }).maxTexels)).toEqual([1024, 2048, LIGHTING_QUALITY.high.maxTexels]);
    expect(choicesOf('bounce').map((bounce) => traced({ bounce }).bounceMaxSide)).toEqual([0, 6144, Infinity]);
    expect(choicesOf('flames').map((flames) => traced({ flames }).flickerMs)).toEqual([66, LIGHTING_QUALITY.high.flickerMs]);
    expect(choicesOf('shadows').map((shadows) => traced({ shadows }).tileRays)).toEqual([8, 16, LIGHTING_QUALITY.high.tileRays]);
    expect(choicesOf('litMap').map((litMap) => traced({ litMap }).compositePixelRatio)).toEqual([1, undefined]);
    expect(choicesOf('picture').map((picture) => qualityOf({ ...GRAPHICS_PRESETS.high, picture }).picture)).toEqual(['polygons', undefined]);
    // Liquids: the frames a second the layer plays at on an ordinary cell, and the detail it is drawn at.
    const fps = choicesOf('liquids').map((liquids) => liquidFps(traced({ liquids }).liquidFps, 70));
    expect(fps).toEqual([10, 15, 30]);
    expect(new Set(choicesOf('liquids').map((liquids) => liquidDetail(traced({ liquids }).liquidFps))).size).toBeGreaterThan(1);
  });
});
