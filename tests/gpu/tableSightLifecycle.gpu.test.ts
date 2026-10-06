import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { LightingEngine as OriginalEngine } from '../oracles/tableSightBaseline/LightingEngine';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { EngineScene } from '../../src/app/pixi/lighting/engine/types';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { playerTokenSight } from '../../src/app/pixi/lighting/playerLightingLayers';
import { computeSight, NO_SIGHT } from '../../src/app/vision/sight';
import type { SightRules } from '../../src/app/vision/sightRules';
import { referenceEngine } from '../helpers/tableSightReference';
import { byteDifferences, rgb, tableScenes, visionToken } from '../helpers/tableSightScene';

const ECHO_RULES: SightRules = {
  definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!,
  conditions: [{ id: 'blind', name: 'Blind', color: '#ffffff', effect: 'blinded' }],
};

/** All pixels of a fixed camera, accepting either engine through its public drawing surface. */
function picture(engine: Pick<LightingEngine, 'layer' | 'setView'>, renderer: WebGLRenderer): Uint8ClampedArray {
  const stage = new Container();
  const floor = new Sprite(Texture.WHITE);
  floor.setSize(128, 128);
  floor.tint = 0x6699cc;
  stage.addChild(floor, engine.layer);
  engine.setView(new Matrix(), 1);
  const target = RenderTexture.create({ width: 128, height: 128 });
  try {
    renderer.render({ container: stage, target, clear: true });
    return renderer.extract.pixels({ target }).pixels;
  } finally {
    stage.removeChild(engine.layer);
    stage.destroy({ children: true });
    target.destroy(true);
  }
}

describe('separate sight frame lifetimes', () => {
  const { scene } = tableScenes();

  it('preserves the GM creature footprint from a hidden precise sense while the player sees none', async () => {
    const hidden = visionToken('hidden', 170, true);
    hidden.vision = { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 20 }] };
    hidden.conditions = ['blind'];
    const prey = visionToken('prey', 200);
    prey.vision = { enabled: false };
    const h = await scene({ tokens: { hidden, prey }, rules: ECHO_RULES, lighting: { ambient: 0, exploredMemory: false } });
    const reference = referenceEngine(h.renderer, h.store.getState(), ECHO_RULES);
    try {
      const originalGm = h.reference(reference);
      const gm = h.pixels('gm');
      expect(byteDifferences(originalGm, gm)).toBe(0);
      expect(rgb(gm, 200, 128)).not.toEqual([0, 0, 0]);
      expect(rgb(h.pixels('player'), 200, 128)).toEqual([0, 0, 0]);
      expect(playerTokenSight(h.lighting, h.store.getState().objects.tokens, { conditions: ECHO_RULES.conditions })?.('prey')).toBe('unseen');
      expect(byteDifferences(originalGm, h.thumbnail())).toBe(0);
      expect(rgb(h.pixels('player'), 200, 128)).toEqual([0, 0, 0]);
      expect(byteDifferences(originalGm, h.pixels('gm'))).toBe(0);
    } finally { reference.destroy(); }
  });

  it('restores the selected player sight after GPU resources are recreated', async () => {
    const renderer = await createTestRenderer(128);
    const engine = new LightingEngine(renderer);
    const original = new OriginalEngine(renderer);
    const sight = computeSight([{ tokenId: 'hidden', origin: { x: 64, y: 64 }, range: 100, senses: [] }], []);
    const state: EngineScene = { bounds: { width: 128, height: 128 }, albedo: null, walls: [], lights: [],
      sight, sightRadius: 20, spots: [], playerSight: NO_SIGHT, playerSpots: [], ambient: 1 };
    try {
      original.setEnabled(true);
      original.update(state);
      original.flush();
      const gm = picture(original, renderer);
      engine.setEnabled(true);
      engine.update(state);
      engine.flush();
      expect(byteDifferences(gm, picture(engine, renderer))).toBe(0);
      engine.setMode('player');
      const player = picture(engine, renderer);
      expect(player.every((value, i) => i % 4 === 3 || value === 0)).toBe(true);
      expect(byteDifferences(gm, player)).toBeGreaterThan(0);
      // PIXI recreates its GL systems; every engine texture must be built again.
      renderer.runners.contextChange.emit(renderer.gl);
      expect(engine.takeRestored()).toBe(true);
      engine.flush();
      // No setMode call here: restoring the context must preserve the selected frame itself.
      expect(byteDifferences(player, picture(engine, renderer))).toBe(0);
      const thumbnail = engine.renderFrame({ x: 0, y: 0, resolution: 1 }, () => picture(engine, renderer));
      expect(byteDifferences(gm, thumbnail)).toBe(0);
      expect(byteDifferences(player, picture(engine, renderer))).toBe(0);
      engine.setMode('gm');
      expect(byteDifferences(gm, picture(engine, renderer))).toBe(0);
      engine.setMode('player');
      expect(byteDifferences(player, picture(engine, renderer))).toBe(0);
    } finally { engine.destroy(); original.destroy(); renderer.destroy(); }
  });
});
