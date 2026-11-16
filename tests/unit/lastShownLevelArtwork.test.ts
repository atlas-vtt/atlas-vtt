// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Asset } from '../../src/app/services/AssetService';
import { lastShownLevelArtwork } from '../../src/app/react/components/dashboard/libraryPictures';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SCENE = 'scenes/tower.atlasmap';
const LEVELS = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png' },
];

const artworkOf = (state: Record<string, unknown>, scene = JSON.stringify({ version: 5, state: { schema: 'atlas-vtt', version: 5, background: 'maps/ground.png', levels: LEVELS, ...state } })): Promise<string | null> => {
  const { app } = createInMemoryApp({ files: { [SCENE]: scene, 'maps/ground.png': '', 'maps/upper.png': '' } });
  return lastShownLevelArtwork(app, { type: 'scene', data: { mapPath: SCENE } } as Asset);
};

describe('the image of the level a scene was last shown on', () => {
  it('is that level\'s for a scene left on an upper level', async () => {
    expect(await artworkOf({ viewedLevel: 'upper' })).toBe('maps/upper.png');
  });

  it('leaves the choice to the caller on the first level, an unknown one or a broken file', async () => {
    expect(await artworkOf({})).toBeNull();
    expect(await artworkOf({ viewedLevel: 'cellar' })).toBeNull();
    expect(await artworkOf({}, 'not json')).toBeNull();
  });
});
