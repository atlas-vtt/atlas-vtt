import { describe, expect, it } from 'vitest';
import { migrateMapFile, parseSceneFile } from '../../src/app/services/MapPersistence';
import { newSceneTokenSettings } from '../../src/app/resources/sceneVisibility';
import { newSceneFile } from '../../src/app/services/newSceneFile';
import { DEFAULT_TOKEN_SETTINGS } from '../../src/app/storeFactory';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';

const GRID = {
  enabled: true,
  visible: true,
  snapToGrid: true,
  type: 'square',
  size: 70,
  offsetX: 0,
  offsetY: 0,
  opacity: 0.5,
  lineType: 'solid',
  lineWidth: 1,
  autoDetect: true,
};

/** A new scene's file as the New scene dialog has always written it, key for key. */
function expectedFile(background: string | null, grid: Record<string, unknown>, tokenSettings: Record<string, unknown>): string {
  return JSON.stringify({
    state: {
      schema: 'atlas-vtt',
      version: 4,
      background,
      grid,
      objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} },
      camera: { x: 0, y: 0, scale: 1 },
      tokenSettings,
    },
    version: 4,
  }, null, 2);
}

describe('the file of a new scene', () => {
  it('holds Atlas\' default grid, to be aligned on the first load, in a collection without rules of its own', () => {
    const file = newSceneFile({ conditions: [] }, null);

    expect(JSON.stringify(file, null, 2)).toBe(expectedFile(null, GRID, newSceneTokenSettings(undefined, DEFAULT_TOKEN_SETTINGS)));
    expect(file.state.tokenSettings).toMatchObject({ showNameplates: false, showHPBars: true, showStressBars: false });
  });

  it('measures as its collection does and shows the bars its collection shows', () => {
    const settings: CollectionSettings = {
      conditions: [],
      gridDefaults: { unitType: 'custom', unitDistance: 2, measurementMode: 'abstract', abstractRangeBands: [{ name: 'Near', maxSquares: 6 }] },
      defaultWidgets: { hpBar: false, stressBar: true },
    };

    const file = newSceneFile(settings, 'atlas-vtt/assets/keep.webp');

    expect(JSON.stringify(file, null, 2)).toBe(expectedFile(
      'atlas-vtt/assets/keep.webp',
      { ...GRID, unitType: 'custom', unitDistance: 2, measurementType: 'abstract' },
      newSceneTokenSettings(settings.defaultWidgets, DEFAULT_TOKEN_SETTINGS),
    ));
    expect(file.state.tokenSettings).toMatchObject({ showHPBars: false, showStressBars: true });
    expect(newSceneFile({ ...settings, gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' } }, null).state.grid)
      .toMatchObject({ unitType: 'meters', unitDistance: 1.5, measurementType: 'units' });
  });

  it('has no grid at a table that plays without one: nothing shows, nothing snaps and nothing is looked for', () => {
    const { grid } = newSceneFile({ conditions: [] }, 'atlas-vtt/assets/keep.webp', false).state;

    expect(grid).toMatchObject({ enabled: true, visible: false, snapToGrid: false, size: 70 });
    expect(grid).not.toHaveProperty('autoDetect');
  });

  it('loads as an empty scene', () => {
    const loaded = migrateMapFile(parseSceneFile(JSON.stringify(newSceneFile({ conditions: [] }, 'atlas-vtt/assets/keep.webp'))).state);

    expect(loaded).toMatchObject({ background: 'atlas-vtt/assets/keep.webp', objects: { tokens: {}, walls: {}, lights: {} }, grid: { size: 70, autoDetect: true } });
  });
});
