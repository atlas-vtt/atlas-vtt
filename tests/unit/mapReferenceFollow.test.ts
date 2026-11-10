// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));

import { AssetService } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { mayNameMoves } from '../../src/app/services/movedPathNeedles';
import { WORK_SLICE_MS } from '../../src/app/utils/workSlices';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const scenes = 'atlas-vtt/collections/default/scenes';
const art = 'atlas-vtt/collections/default/tokens/Rogue Elf.webp';
const moved = 'atlas-vtt/collections/default/tokens/Thieves/Rogue Elf.webp';

const mapFile = (state: Record<string, unknown>): string => JSON.stringify({ version: 3, state }, null, 2);
const tokenMap = (imagePath: string): string => mapFile({ objects: { tokens: { t: { id: 't', imagePath } }, pins: {} } });
const map = (files: Map<string, string>, name: string): { state: { objects: { tokens: Record<string, { imagePath: string }>; pins: Record<string, { notePath: string }> } } } =>
  JSON.parse(files.get(`${scenes}/${name}.atlasmap`)!);

beforeEach(() => Reflect.set(AssetService, 'instance', null));
afterEach(() => { vi.restoreAllMocks(); });

describe('following moved files into saved maps', () => {
  it('rewrites every map that names the moved file, in any stored form, and leaves the others byte for byte', async () => {
    const untouched = tokenMap('atlas-vtt/collections/default/tokens/Goblin.webp');
    const { app, files } = createInMemoryApp({
      files: {
        [`${scenes}/Raw.atlasmap`]: tokenMap(art),
        [`${scenes}/Url.atlasmap`]: tokenMap(`app://local/Users/gm/Vault/${encodeURI(art)}?1700000000`),
        [`${scenes}/Pin.atlasmap`]: mapFile({ objects: { tokens: {}, pins: { p: { id: 'p', notePath: `${art}#Face` } } } }),
        [`${scenes}/Other.atlasmap`]: untouched,
      },
    });
    const parse = vi.spyOn(JSON, 'parse');

    await new FileReferenceService(app).handleFilesMoved([{ from: art, to: moved }]);

    expect(map(files, 'Raw').state.objects.tokens.t.imagePath).toBe(moved);
    expect(map(files, 'Url').state.objects.tokens.t.imagePath).toBe(moved);
    expect(map(files, 'Pin').state.objects.pins.p.notePath).toBe(`${moved}#Face`);
    expect(files.get(`${scenes}/Other.atlasmap`)).toBe(untouched);
    // A map that cannot name the file is never parsed.
    expect(parse.mock.calls.some(([text]) => text === untouched)).toBe(false);
  });

  it('follows a moved folder into the maps whose pins roll a folder below it', async () => {
    const { app, files } = createInMemoryApp({
      files: { [`${scenes}/Keep.atlasmap`]: mapFile({ objects: { tokens: {}, pins: { p: { id: 'p', notePath: 'Encounters/Caves/Deep' } } } }) },
    });

    await new FileReferenceService(app).followMovedFolders([{ from: 'Encounters/Caves', to: 'Encounters/Underdark' }]);

    expect(map(files, 'Keep').state.objects.pins.p.notePath).toBe('Encounters/Underdark/Deep');
  });

  it('gives the browser a turn between slices of a long run of maps', async () => {
    const seed: Record<string, string> = {};
    for (let i = 0; i < 12; i++) seed[`${scenes}/Map ${i}.atlasmap`] = tokenMap(i % 3 === 0 ? art : 'other.webp');
    const { app, files } = createInMemoryApp({ files: seed });
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += WORK_SLICE_MS / 2));
    let turns = 0;
    const timer = setInterval(() => { turns += 1; }, 0);

    await new FileReferenceService(app).handleFilesMoved([{ from: art, to: moved }]);
    clearInterval(timer);

    expect(turns).toBeGreaterThan(0);
    for (let i = 0; i < 12; i += 3) expect(map(files, `Map ${i}`).state.objects.tokens.t.imagePath).toBe(moved);
  });
});

describe('mayNameMoves', () => {
  it('passes every text that holds the words of the moved name, and only those', () => {
    const mayName = mayNameMoves([{ from: 'Art/Rogue Elf.webp', to: 'Art/Rogue.webp' }]);

    expect(mayName('"imagePath": "Art/Rogue Elf.webp"')).toBe(true);
    expect(mayName('"imagePath": "app://local/Vault/Art/Rogue%20Elf.webp?1"')).toBe(true);
    expect(mayName('"imagePath": "Art/Rogue.webp"')).toBe(false);
  });

  it('passes every text where the moved name has no letters or digits to look for', () => {
    expect(mayNameMoves([{ from: 'Art/地图.', to: 'Art/map.' }])('{}')).toBe(true);
  });
});
