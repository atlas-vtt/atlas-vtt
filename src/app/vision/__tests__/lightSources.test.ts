import { describe, expect, it } from 'vitest';
import { activeLights, engineLight } from '../lightSources';
import { LIGHT_PRESETS } from '../../lighting/lightPresets';
import type { LightSource } from '../../types/lightingTypes';
import type { TokenEntity } from '../../types';

const torch = LIGHT_PRESETS.torch.emission;
const scale = { unitDistance: 5, cellSize: 70 };

describe('activeLights', () => {
  it('collects placed lights that are on and lights carried by tokens', () => {
    const lights: Record<string, LightSource> = {
      a: { id: 'a', kind: 'light', x: 1, y: 2, emission: torch },
      off: { id: 'off', kind: 'light', x: 0, y: 0, emission: torch, hidden: true },
    };
    const tokens: Record<string, TokenEntity> = {
      t: { id: 't', kind: 'token', imagePath: 't.png', x: 5, y: 6, light: torch },
      plain: { id: 'plain', kind: 'token', imagePath: 'p.png', x: 0, y: 0 },
    };
    expect(activeLights(lights, tokens)).toEqual([
      { key: 'light:a', x: 1, y: 2, emission: torch },
      { key: 'token:t', x: 5, y: 6, emission: torch },
    ]);
  });

  it('leaves out a placed light that follows the ambient light while the scene is brighter than its level', () => {
    const lights: Record<string, LightSource> = {
      lamp: { id: 'lamp', kind: 'light', x: 1, y: 2, emission: torch, activeBelowAmbient: 0.5 },
      torch: { id: 'torch', kind: 'light', x: 3, y: 4, emission: torch },
    };
    const tokens: Record<string, TokenEntity> = { t: { id: 't', kind: 'token', imagePath: 't.png', x: 5, y: 6, light: torch } };
    expect(activeLights(lights, tokens, 1).map((light) => light.key)).toEqual(['light:torch', 'token:t']);
    expect(activeLights(lights, tokens, 0.5).map((light) => light.key)).toEqual(['light:lamp', 'light:torch', 'token:t']);
    expect(activeLights(lights, tokens, 0.15).map((light) => light.key)).toEqual(['light:lamp', 'light:torch', 'token:t']);
    // Without an ambient level every light that is switched on counts.
    expect(activeLights(lights, tokens).map((light) => light.key)).toEqual(['light:lamp', 'light:torch', 'token:t']);
  });

  it('turns a placed light as it was turned, and a carried one with its token', () => {
    const lights: Record<string, LightSource> = { a: { id: 'a', kind: 'light', x: 1, y: 2, emission: torch, rotation: 45 } };
    const tokens: Record<string, TokenEntity> = { t: { id: 't', kind: 'token', imagePath: 't.png', x: 5, y: 6, rotation: 180, light: torch } };
    expect(activeLights(lights, tokens)).toEqual([
      { key: 'light:a', x: 1, y: 2, emission: torch, rotation: 45 },
      { key: 'token:t', x: 5, y: 6, emission: torch, rotation: 180 },
    ]);
  });
});

describe('engineLight', () => {
  it('converts game units, keeps a minimum flame and tints the colour halfway to white in linear light', () => {
    const light = engineLight({ key: 'k', x: 10, y: 20, emission: { ...torch, color: '#ff0000', sourceRadius: 0.1 } }, scale);
    expect(light).toMatchObject({ key: 'k', x: 10, y: 20, bright: 280, dim: 560, animation: torch.animation });
    expect(light.flame).toBeCloseTo(560 * 0.12, 6);
    expect(light.color[0]).toBe(1);
    expect(light.color[1]).toBeCloseTo(((0.5 + 0.055) / 1.055) ** 2.4, 6);
  });

  it('makes a darkness a source without a bright part and without flicker, and carries its priority', () => {
    const darkness = engineLight({ key: 'd', x: 0, y: 0, emission: { ...LIGHT_PRESETS.darkness.emission, bright: 10, animation: 'magic', priority: 2 } }, scale);
    expect(darkness).toMatchObject({ bright: 0, dim: 210, animation: 'none', darkness: true, priority: 2 });
    // A light without the new fields is the light it always was.
    const plain = engineLight({ key: 'k', x: 0, y: 0, emission: torch }, scale);
    expect(plain).not.toHaveProperty('darkness');
    expect(plain).not.toHaveProperty('priority');
    expect(engineLight({ key: 'k', x: 0, y: 0, emission: { ...torch, priority: 1 } }, scale).priority).toBe(1);
  });

  it('gives a light with an angle a cone that faces where the light is turned, with its own space half a cell around it', () => {
    const lantern = { ...torch, angle: 90 };
    // Rotation is the token renderer's: 0 faces up on the map, 90 right.
    expect(engineLight({ key: 'k', x: 0, y: 0, emission: lantern, rotation: 90 }, scale).cone).toEqual({ facing: 0, angle: Math.PI / 2, apex: 35 });
    expect(engineLight({ key: 'k', x: 0, y: 0, emission: lantern }, scale).cone?.facing).toBeCloseTo(-Math.PI / 2);
    // All around is no cone: 360, nothing, or a number that is no angle.
    for (const angle of [360, 400, 0, -5, Number.NaN]) expect(engineLight({ key: 'k', x: 0, y: 0, emission: { ...torch, angle }, rotation: 90 }, scale)).not.toHaveProperty('cone');
    expect(engineLight({ key: 'k', x: 0, y: 0, emission: torch, rotation: 90 }, scale)).not.toHaveProperty('cone');
    // A darkness is a sphere.
    expect(engineLight({ key: 'd', x: 0, y: 0, emission: { ...LIGHT_PRESETS.darkness.emission, angle: 90 } }, scale)).not.toHaveProperty('cone');
  });
});
