import { describe, expect, it } from 'vitest';
import { sceneImagePaths } from '../../../src/app/levels/levelFile';
import { withLevelRoof } from '../../../src/app/levels/levelEdits';
import { AssetValidationService, SCENE_BACKGROUND } from '../../../src/app/services/AssetValidationService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const levels = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webm' },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];

describe('the map images of a scene file', () => {
  it('lists the scene\'s background and every level\'s map once, as the file holds them', () => {
    expect(sceneImagePaths({ background: 'maps/ground.webp', levels })).toEqual(['maps/ground.webp', 'maps/upper.webm']);
    expect(sceneImagePaths({ background: 'maps/ground.webp', levels: [null, 'x', { background: 3, foreground: 'roof.webp' }] }))
      .toEqual(['maps/ground.webp', 'roof.webp']);
    expect(sceneImagePaths({ background: null })).toEqual([]);
  });
});

describe('checking a scene\'s files', () => {
  it('reports a floor whose map is gone by its level, and the scene\'s own map as the background', async () => {
    const { app } = createInMemoryApp({ files: { 'maps/ground.webp': 'BG' } });
    const service = new AssetValidationService({ app });

    const result = await service.validateMapAssets({ background: 'maps/ground.webp', levels, objects: { tokens: {} } });
    expect(result.valid).toBe(false);
    expect(result.missingAssets).toEqual([expect.objectContaining({ type: 'map', path: 'maps/upper.webm', objectId: 'upper' })]);

    const gone = await new AssetValidationService({ app }).validateMapAssets({ background: 'maps/gone.webp', objects: { tokens: {} } });
    expect(gone.missingAssets).toEqual([expect.objectContaining({ type: 'map', objectId: SCENE_BACKGROUND })]);
  });
});

describe('a level\'s roof', () => {
  it('is checked like a level\'s map, on the first level too, and reported by its level as a roof', async () => {
    const { app } = createInMemoryApp({ files: { 'maps/ground.webp': 'BG', 'maps/upper.webm': 'UP', 'maps/eaves.png': 'R' } });
    const roofed = [{ ...levels[0]!, foreground: 'maps/thatch.png' }, { ...levels[1]!, foreground: 'maps/eaves.png' }, levels[2]!];
    const result = await new AssetValidationService({ app }).validateMapAssets({ background: 'maps/ground.webp', levels: roofed, objects: { tokens: {} } });
    expect(result.missingAssets).toEqual([expect.objectContaining({ type: 'roof', path: 'maps/thatch.png', objectId: 'ground' })]);
  });

  it('is set on a level as a scene setting and removed as no field; a scene without levels gets its one level to carry it', () => {
    const scene = { levels: undefined, background: 'maps/ground.webp' };
    const made = withLevelRoof(scene, null, 'maps/roof.png', 'Ground floor')!;
    expect(made).toEqual([expect.objectContaining({ name: 'Ground floor', background: 'maps/ground.webp', foreground: 'maps/roof.png' })]);
    expect(withLevelRoof({ ...scene, levels: made }, made[0]!.id, null, 'Ground floor')![0]).not.toHaveProperty('foreground');
    expect(withLevelRoof(scene, null, null, 'Ground floor')).toBeNull();
    expect(withLevelRoof({ levels, background: null }, 'upper', 'maps/r.png', 'x')!.map((level) => level.foreground)).toEqual([undefined, 'maps/r.png', undefined]);
  });
});
