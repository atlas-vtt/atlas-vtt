import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { meanChange, waterPicture, waterScene } from './waterEvidenceHarness';

describe('water motion remains subordinate to the map illustration', () => {
  let renderer: Awaited<ReturnType<typeof createTestRenderer>>;
  beforeAll(async () => { renderer = await createTestRenderer(960); });
  afterAll(() => renderer.destroy());
  it('keeps the engraved image free of luminous caustic washes', async () => {
    const scene = await waterScene('print', false);
    try {
      scene.layer.container.visible = false;
      const art = waterPicture(renderer, scene);
      scene.layer.container.visible = true;
      scene.step(8);
      const animated = waterPicture(renderer, scene);
      // Light may break the hatch here and there, as the engraver's own glints do, never wash over it.
      let ink = 0;
      let liftedInk = 0;
      for (let i = 0; i < art.length; i += 4) {
        if (art[i]! >= 120) continue;
        ink++;
        if (animated[i]! - art[i]! > 20) liftedInk++;
      }
      expect(liftedInk / ink, 'thin ink must stay ink, without white caustics laid over it').toBeLessThan(0.05);
    } finally { scene.destroy(); }
  });
  it('changes spatial detail with quality even while the water is held still', async () => {
    const scene = await waterScene('parchment', false);
    try {
      scene.layer.setMode('poster');
      const high = waterPicture(renderer, scene);
      scene.quality(1); scene.step(0.2);
      const balanced = waterPicture(renderer, scene);
      scene.quality(0); scene.step(0.2);
      const saver = waterPicture(renderer, scene);
      expect(meanChange(high, balanced)).toBeGreaterThan(0.005);
      expect(meanChange(balanced, saver)).toBeGreaterThan(0.005);
      expect(meanChange(high, saver)).toBeLessThan(2);
    } finally { scene.destroy(); }
  });
});

// The long-running clock and drift periods are deliberately independent. Neither may jump.
describe('water over long sessions', () => {
  it('keeps pigment and movement continuous at clock and drift wraps', async () => {
    const { Container, RenderTexture } = await import('pixi.js');
    const { LiquidMesh } = await import('../../src/app/pixi/liquids/LiquidMesh');
    const renderer = await createTestRenderer(256);
    const target = RenderTexture.create({ width: 256, height: 256 });
    try {
      for (const art of [undefined, 'engraved', 'crayon'] as const) for (const flowing of [false, true]) {
        const surface = new LiquidMesh({ id: 'wrap-water', kind: 'liquid', liquid: 'water', ...(art && { art }),
          polygon: [{ x: -200, y: -200 }, { x: 500, y: -200 }, { x: 500, y: 500 }, { x: -200, y: 500 }],
          colors: { surface: '#789695', deep: '#344746', glint: '#c8dad9' }, ...(flowing && { flow: { x: 0.6, y: 0.8 } }),
        }, 100);
        const world = new Container();
        world.addChild(surface.mesh);
        try {
          const picture = (seconds: number): Uint8ClampedArray => {
            surface.setTime(seconds);
            renderer.render({ container: world, target, clear: true });
            return renderer.extract.pixels({ target }).pixels;
          };
          // The water's ordinary steps, away from every wrap (they vary with the drips and glints alive): a wrap may move it no more.
          const step = Math.max(...[1000.37, 2000.71, 3100.13].map(t => meanChange(picture(t - 1 / 60), picture(t + 1 / 60))));
          // 64 / 0.28: a channel's ripples (and Crayon's strokes riding them) wrap by a tile.
          for (const time of [1600, 64 / 0.028, 64 / 0.055, 64 / 0.28, 4096, 1e7]) {
            const before = picture(time - 1 / 60);
            const after = picture(time + 1 / 60);
            expect(meanChange(before, after), `${art ?? 'painted'}, flow ${flowing}, time ${time}`).toBeLessThan(step * 1.5 + 0.1);
            // Water is pigment, never additive emission, even on a transparent target.
            for (let i = 0; i < after.length; i += 4) for (let c = 0; c < 3; c++) expect(after[i + c]!).toBeLessThanOrEqual(after[i + 3]! + 1);
          }
        } finally { surface.destroy(); world.destroy(); }
      }
    } finally { target.destroy(true); renderer.destroy(); }
  });
});
