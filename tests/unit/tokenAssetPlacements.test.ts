import { expect, it } from 'vitest';
import { findTokenPlacements, removeTokenPlacements } from '../../src/app/services/tokenAssetPlacements';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const map = (tokens: Record<string, { id: string; imagePath: string }>) =>
  JSON.stringify({ version: 4, state: { objects: { tokens } } });

it('finds maps placing the image and strips those tokens from closed maps', async () => {
  const { app, files } = createInMemoryApp({
    files: {
      'a.atlasmap': map({ t1: { id: 't1', imagePath: 'goblin.webp' }, t2: { id: 't2', imagePath: 'orc.webp' } }),
      'b.atlasmap': map({ t3: { id: 't3', imagePath: 'orc.webp' } }),
    },
  });
  app.workspace = { getLeavesOfType: () => [] } as any;

  const placements = await findTokenPlacements(app as any, ['goblin.webp']);
  expect(placements.map((f) => f.path)).toEqual(['a.atlasmap']);

  await removeTokenPlacements(app as any, placements, ['goblin.webp']);
  expect(Object.keys(JSON.parse(files.get('a.atlasmap')!).state.objects.tokens)).toEqual(['t2']);
  expect(files.get('b.atlasmap')).toBe(map({ t3: { id: 't3', imagePath: 'orc.webp' } }));
});

it('takes the auras of the tokens it strips from a closed map along, and leaves every other measurement', async () => {
  const measures = {
    a: { id: 'a', kind: 'measure', shape: 'circle', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], follows: 't1', aura: 10 },
    b: { id: 'b', kind: 'measure', shape: 'circle', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], follows: 't2', aura: 10 },
    c: { id: 'c', kind: 'measure', shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] },
  };
  const tokens = { t1: { id: 't1', imagePath: 'goblin.webp' }, t2: { id: 't2', imagePath: 'orc.webp' } };
  const { app, files } = createInMemoryApp({ files: { 'a.atlasmap': JSON.stringify({ version: 4, state: { objects: { tokens, measures } } }) } });
  app.workspace = { getLeavesOfType: () => [] } as any;
  await removeTokenPlacements(app as any, await findTokenPlacements(app as any, ['goblin.webp']), ['goblin.webp']);
  expect(Object.keys(JSON.parse(files.get('a.atlasmap')!).state.objects.measures)).toEqual(['b', 'c']);
});
