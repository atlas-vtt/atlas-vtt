import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { DUNGEON_STYLES, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { meanChange, WATER_CAPTURE, WATER_OUT, WATER_PHASE, waterGpuCost, waterPicture, waterPng, waterScene, type WaterSource } from './waterEvidenceHarness';

/** VITE_WATER_PHASE=before|after VITE_WATER_CAPTURE=1 saves 90 deterministic frames per look. */
describe('water belongs to the generated map artwork', () => {
  let renderer: Awaited<ReturnType<typeof createTestRenderer>>;
  beforeAll(async () => { renderer = await createTestRenderer(960); });
  afterAll(() => renderer.destroy());

  const cases: { id: DungeonStyleId; mono: boolean; source: WaterSource }[] = DUNGEON_STYLES.flatMap(({ id }) => [false, true].map(mono => ({ id, mono, source: 'pool' as const })));
  cases.push({ id: 'parchment', mono: false, source: 'channel' }, { id: 'print', mono: false, source: 'channel' }, { id: 'crayon', mono: false, source: 'channel' });
  cases.push({ id: 'parchment', mono: false, source: 'river' }, { id: 'contrast', mono: false, source: 'river' }, { id: 'crayon', mono: false, source: 'river' });
  for (const { id, mono, source } of cases) {
    const name = `${id}${mono ? '-mono' : ''}${source === 'pool' ? '' : `-${source}`}`;
    it(`renders still art and calm, visibly moving water in ${name}`, async () => {
      const scene = await waterScene(id, mono, source);
      try {
        scene.layer.container.visible = false;
        const art = waterPicture(renderer, scene);
        scene.layer.container.visible = true;
        scene.step(8);
        const first = waterPicture(renderer, scene);
        expect(meanChange(art, first)).toBeGreaterThan(0.02);
        if (WATER_CAPTURE) {
          await waterPng(art, `${name}/art`);
          await waterPng(first, `${name}/still`);
        }
        let previous = first;
        let maxStep = 0;
        const frames = WATER_CAPTURE ? 90 : 6;
        for (let frame = 0; frame < frames; frame++) {
          if (frame > 0) scene.step(1 / 30);
          const pixels = waterPicture(renderer, scene);
          maxStep = Math.max(maxStep, meanChange(previous, pixels));
          if (WATER_CAPTURE) await waterPng(pixels, `${name}/frames/${String(frame).padStart(3, '0')}`);
          previous = pixels;
        }
        expect(meanChange(first, previous)).toBeGreaterThan(0.001);
        // Visibly alive at play zoom a second on: the water moved too faintly to see before 2026-10-25.
        scene.step(1);
        const alive = meanChange(first, waterPicture(renderer, scene));
        expect(alive).toBeGreaterThan(0.1);
        expect(maxStep, 'no abrupt flashes between 30 fps frames').toBeLessThan(1.2);
        scene.layer.setMode('poster');
        const poster = waterPicture(renderer, scene);
        scene.step(1);
        expect(meanChange(poster, waterPicture(renderer, scene))).toBe(0);
      } finally { scene.destroy(); }
    });
  }

  it('measures liquid-only GPU time at each quality, over generated geometry', async () => {
    const measurements = [];
    for (const look of ['parchment', 'print'] as const) {
      const scene = await waterScene(look, false);
      try {
        scene.map.visible = false;
        for (const [quality, detail] of [['high', 2], ['balanced', 1], ['saver', 0]] as const) {
          scene.quality(detail);
          scene.step(1);
          const cost = await waterGpuCost(renderer, () => renderer.render({ container: scene.world, target: scene.target, clear: true }));
          measurements.push({ look, quality, ...cost });
        }
      } finally { scene.destroy(); }
    }
    await commands.writeFile(`${WATER_OUT}/${WATER_PHASE}/gpu.json`, JSON.stringify(measurements, null, 2));
    console.log('[water GPU]', JSON.stringify(measurements.map(({ samples, ...rest }) => ({ ...rest, count: samples.length }))));
  });
});
