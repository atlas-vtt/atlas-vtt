import { describe, expect, it } from 'vitest';
import { BelowLayout } from '../../../src/app/pixi/lighting/levels/belowLayout';
import type { LevelArt } from '../../../src/app/levels/artRaster';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'upper.png' },
];

/** A 200 × 100 map whose left half holds no art (`upper.png`), or art everywhere. */
function artOf(background: string | null): LevelArt {
  const opaque = new Uint8Array(200 * 100).fill(1);
  if (background === 'upper.png') for (let row = 0; row < 100; row++) opaque.fill(0, row * 200, row * 200 + 100);
  return { width: 200, height: 100, alpha: { width: 200, height: 100, opaque } };
}

describe('what the view lays out of the levels\' maps, for a drop', () => {
  it('answers floor or no floor where it laid a map out, and nothing where it did not', async () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `below-layout-${Math.random()}`);
    store.setState({ levels: LEVELS, viewedLevel: 'upper', background: 'ground.png' });
    const layout = new BelowLayout((background) => Promise.resolve(artOf(background)), () => undefined);
    const bounds = { width: 200, height: 100 };
    expect(layout.artFloorAt('upper', { x: 20, y: 50 })).toBeNull();
    layout.update(store.getState(), bounds);
    await Promise.resolve();
    layout.update(store.getState(), bounds);
    await Promise.resolve();
    layout.update(store.getState(), bounds);

    // Open well inside the transparent half, floor on the art; the edge texel next to art stays floor (the shrink).
    expect(layout.artFloorAt('upper', { x: 20, y: 50 })).toBe(false);
    expect(layout.artFloorAt('upper', { x: 99.5, y: 50 })).toBe(true);
    expect(layout.artFloorAt('upper', { x: 150, y: 50 })).toBe(true);
    expect(layout.artFloorAt('ground', { x: 20, y: 50 })).toBe(true);
    // The ground is laid out only where the view above is open; off the grid nothing is known.
    expect(layout.artFloorAt('ground', { x: 150, y: 50 })).toBeNull();
    expect(layout.artFloorAt('upper', { x: 500, y: 50 })).toBeNull();
    expect(layout.artFloorAt('cellar', { x: 20, y: 50 })).toBeNull();
  });
});
