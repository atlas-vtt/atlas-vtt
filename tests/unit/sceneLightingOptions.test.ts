import { describe, expect, it } from 'vitest';
import { brightThresholdOf, clampLitThreshold, darkSightLookOf, gmPictureDiffers, darkSightTintOf, exploredMemoryOn, litThresholdOf, readSceneLighting, sceneLook, sightOnDropOn, tokenVisionOn, unexploredImageOf, unexploredSoftnessOf } from '../../src/app/lighting/sceneLightingOptions';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';

describe('scene lighting options', () => {
  it('uses token vision and explored memory unless the scene switches them off', () => {
    expect(tokenVisionOn(DEFAULT_SCENE_LIGHTING)).toBe(true);
    expect(tokenVisionOn({ tokenVision: false })).toBe(false);
    expect(exploredMemoryOn(DEFAULT_SCENE_LIGHTING)).toBe(true);
    expect(exploredMemoryOn({ exploredMemory: false })).toBe(false);
  });

  it('lets sight follow a dragged token unless the scene asks to wait for the drop, and keeps that choice when loaded', () => {
    expect(sightOnDropOn(DEFAULT_SCENE_LIGHTING)).toBe(false);
    expect(sightOnDropOn({ sightOnDrop: false })).toBe(false);
    expect(sightOnDropOn({ sightOnDrop: true })).toBe(true);
    expect(sightOnDropOn(readSceneLighting({ enabled: true, sightOnDrop: true }))).toBe(true);
    expect(sightOnDropOn(readSceneLighting({ enabled: true }))).toBe(false);
  });

  it('counts a scene as lit from 25 % ambient light unless it sets its own threshold', () => {
    expect(litThresholdOf(DEFAULT_SCENE_LIGHTING)).toBe(0.25);
    expect(litThresholdOf({ litThreshold: 0.6 })).toBe(0.6);
    expect(litThresholdOf({ litThreshold: 7 })).toBe(1);
  });

  it('clamps thresholds to 0..1 and replaces non-numbers with the default', () => {
    expect(clampLitThreshold(-1)).toBe(0);
    expect(clampLitThreshold(0.4)).toBe(0.4);
    expect(clampLitThreshold(2)).toBe(1);
    expect(clampLitThreshold(Number.NaN)).toBe(0.25);
  });

  it('counts ambient light as bright from 75 % unless the scene sets its own bright threshold', () => {
    expect(brightThresholdOf(DEFAULT_SCENE_LIGHTING)).toBe(0.75);
    expect(brightThresholdOf({ brightThreshold: 0.6 })).toBe(0.6);
    expect(brightThresholdOf({ litThreshold: 0.5, brightThreshold: 0.9 })).toBe(0.9);
  });

  it('never puts the bright threshold below the lit threshold or above 1, and replaces non-numbers with the default', () => {
    expect(brightThresholdOf({ brightThreshold: 0.1 })).toBe(0.25);
    expect(brightThresholdOf({ litThreshold: 0.9 })).toBe(0.9);
    expect(brightThresholdOf({ litThreshold: 0.5, brightThreshold: 0.2 })).toBe(0.5);
    expect(brightThresholdOf({ brightThreshold: 7 })).toBe(1);
    expect(brightThresholdOf({ brightThreshold: Number.NaN })).toBe(0.75);
    expect(brightThresholdOf({ litThreshold: 0.9, brightThreshold: Number.NaN })).toBe(0.9);
  });

  it('reads saved lighting with defaults for missing fields and without unreadable colours', () => {
    expect(readSceneLighting(undefined)).toEqual(DEFAULT_SCENE_LIGHTING);
    expect(readSceneLighting({ enabled: true, ambientColor: '#AABBCC', exploredColor: 'red', unexploredColor: '#12345' }))
      .toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, ambientColor: '#AABBCC' });
  });

  it('reads a fog map for never-seen areas only where it names a path, and drops any other when loaded', () => {
    expect(unexploredImageOf(DEFAULT_SCENE_LIGHTING)).toBeNull();
    expect(unexploredImageOf({ unexploredImage: '  ' })).toBeNull();
    expect(unexploredImageOf({ unexploredImage: 'Maps/fog.png' })).toBe('Maps/fog.png');
    expect(readSceneLighting({ enabled: true, unexploredImage: 'Maps/fog.png' })).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, unexploredImage: 'Maps/fog.png' });
    expect(readSceneLighting({ enabled: true, unexploredImage: 42 })).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true });
    // Not a look option: the renderer hands the engine its texture.
    expect(sceneLook({ ...DEFAULT_SCENE_LIGHTING, unexploredImage: 'Maps/fog.png' })).toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient });
  });

  it('fades into the fog map over 1.5 cells unless the scene sets a width within 0..6, and drops one that is not a number', () => {
    expect(unexploredSoftnessOf(DEFAULT_SCENE_LIGHTING)).toBe(1.5);
    expect(unexploredSoftnessOf({ unexploredSoftness: 3 })).toBe(3);
    expect(unexploredSoftnessOf({ unexploredSoftness: -1 })).toBe(0);
    expect(unexploredSoftnessOf({ unexploredSoftness: 40 })).toBe(6);
    expect(readSceneLighting({ enabled: true, unexploredSoftness: 'wide' })).toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true });
  });

  it('passes the composite only the options it draws, and only those that are set', () => {
    expect(sceneLook({ ...DEFAULT_SCENE_LIGHTING, tokenVision: false })).toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient });
    // The thresholds decide where dim ambient light is raised for senses that see dim light as bright.
    expect(sceneLook({ ...DEFAULT_SCENE_LIGHTING, litThreshold: 0.5, brightThreshold: 0.9 })).toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient, litThreshold: 0.5, brightThreshold: 0.9 });
    expect(sceneLook({ enabled: true, ambient: 0.3, ambientColor: '#ffeedd', exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#0000ff' }))
      .toEqual({ ambient: 0.3, ambientColor: '#ffeedd', exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#0000ff' });
  });

  it('draws darkvision as the system says unless the scene picks grey or colour, and without a tint unless it picks one', () => {
    expect(darkSightLookOf(DEFAULT_SCENE_LIGHTING)).toBe('system');
    expect(darkSightLookOf({ darkSightLook: 'system' })).toBe('system');
    expect(darkSightLookOf({ darkSightLook: 'grey' })).toBe('grey');
    expect(darkSightLookOf({ darkSightLook: 'colour' })).toBe('colour');
    expect(darkSightTintOf(DEFAULT_SCENE_LIGHTING)).toBeNull();
    expect(darkSightTintOf({ darkSightTint: '#40FF80' })).toBe('#40FF80');
  });

  it('reads a darkvision look or tint it cannot draw as unset', () => {
    const unknown = { darkSightLook: 'sepia', darkSightTint: 'green' } as unknown as SceneLighting;
    expect(darkSightLookOf(unknown)).toBe('system');
    expect(darkSightTintOf(unknown)).toBeNull();
  });

  it('keeps a saved darkvision look and tint, and drops those a hand edit broke', () => {
    expect(readSceneLighting({ enabled: true, darkSightLook: 'grey', darkSightTint: '#40ff80' }))
      .toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, darkSightLook: 'grey', darkSightTint: '#40ff80' });
    expect(readSceneLighting({ darkSightLook: 'system' })).toEqual({ ...DEFAULT_SCENE_LIGHTING, darkSightLook: 'system' });
    for (const broken of [{ darkSightLook: 'sepia' }, { darkSightLook: 7 }, { darkSightLook: null }, { darkSightTint: 'green' }, { darkSightTint: '#fff' }, { darkSightTint: 0x40ff80 }]) {
      expect(readSceneLighting(broken)).toEqual(DEFAULT_SCENE_LIGHTING);
    }
  });

  it('passes the composite the darkvision look and tint once the scene sets them', () => {
    expect(sceneLook(DEFAULT_SCENE_LIGHTING)).toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient });
    expect(sceneLook({ ...DEFAULT_SCENE_LIGHTING, darkSightLook: 'colour', darkSightTint: '#40ff80' }))
      .toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient, darkSightLook: 'colour', darkSightTint: '#40ff80' });
  });

  it('counts a new darkvision look or tint as a new picture for the GM, and a look that reads the same as none', () => {
    const lit: SceneLighting = { enabled: true, ambient: 0.1 };
    expect(gmPictureDiffers(lit, { ...lit, darkSightLook: 'grey' })).toBe(true);
    expect(gmPictureDiffers(lit, { ...lit, darkSightTint: '#40ff80' })).toBe(true);
    expect(gmPictureDiffers(lit, { ...lit, darkSightLook: 'system' })).toBe(false);
    expect(gmPictureDiffers(lit, { ...lit, exploredColor: '#40ff80' })).toBe(false);
  });
});
