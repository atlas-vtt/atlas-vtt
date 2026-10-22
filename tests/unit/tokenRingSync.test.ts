import { beforeEach, describe, expect, it, vi } from 'vitest';

const assets = vi.hoisted(() => ({ updateAsset: vi.fn(async () => undefined) }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => assets } }));
const history = vi.hoisted(() => ({ untracked: 0 }));
vi.mock('../../src/app/stores/history', () => ({
  runUntracked: (_store: unknown, fn: () => unknown) => {
    history.untracked += 1;
    return fn();
  },
}));

import { mapWithRing, setTokenRing } from '../../src/app/services/tokenRingSync';

const ART = 'atlas-vtt/assets/Aboleth.webp';

function mapFile(tokens: Record<string, Record<string, unknown>>): string {
  return JSON.stringify({ version: 4, state: { objects: { tokens } } });
}

describe('a token\'s ring, switched beside its statblock', () => {
  beforeEach(() => {
    assets.updateAsset.mockClear();
    history.untracked = 0;
  });

  it('frames every token placed with the art in a map file, and leaves the others', () => {
    const written = mapWithRing(mapFile({
      a: { id: 'a', imagePath: ART, showRing: false },
      b: { id: 'b', imagePath: 'other.webp', showRing: false },
    }), ART, true);
    const tokens = JSON.parse(written!).state.objects.tokens;
    expect(tokens.a.showRing).toBe(true);
    expect(tokens.b.showRing).toBe(false);
  });

  it('writes no map file whose tokens already show it so', () => {
    expect(mapWithRing(mapFile({ a: { id: 'a', imagePath: ART } }), ART, true)).toBeNull();
    expect(mapWithRing(mapFile({ a: { id: 'a', imagePath: ART, showRing: false } }), ART, false)).toBeNull();
  });

  it('changes the asset, an open map untracked, and only the closed map files', async () => {
    const updateTokens = vi.fn();
    const store = { getState: () => ({
      isPlayerView: false,
      mapPath: 'open.atlasmap',
      objects: { tokens: { a: { id: 'a', imagePath: ART, showRing: true }, b: { id: 'b', imagePath: 'x.webp' } } },
      updateTokens,
    }) };
    const files = new Map([
      ['open.atlasmap', mapFile({ a: { id: 'a', imagePath: ART } })],
      ['closed.atlasmap', mapFile({ a: { id: 'a', imagePath: ART } })],
    ]);
    const trigger = vi.fn();
    const app = {
      workspace: { getLeavesOfType: () => [{ view: { getStore: () => store } }], trigger },
      vault: {
        getFiles: () => [...files.keys()].map((path) => ({ path, extension: 'atlasmap' })),
        read: async (file: { path: string }) => files.get(file.path)!,
        process: async (file: { path: string }, fn: (text: string) => string) => { files.set(file.path, fn(files.get(file.path)!)); },
      },
    } as never;

    await setTokenRing(app, { id: 'tok', imagePath: ART }, false);

    expect(assets.updateAsset).toHaveBeenCalledWith('tok', { showRing: false });
    expect(updateTokens).toHaveBeenCalledWith([{ id: 'a', changes: { showRing: false } }]);
    expect(history.untracked).toBe(1);
    expect(JSON.parse(files.get('closed.atlasmap')!).state.objects.tokens.a.showRing).toBe(false);
    // The open map saves its own state: its file is left to it.
    expect(JSON.parse(files.get('open.atlasmap')!).state.objects.tokens.a.showRing).toBeUndefined();
    expect(trigger).toHaveBeenCalledWith('atlas-vtt:refresh-assets');
  });
});
