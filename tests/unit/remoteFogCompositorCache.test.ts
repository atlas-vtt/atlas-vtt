import { describe, expect, it } from 'vitest';
import { FogCoverageCache } from '../../src/app/fog/FogCoverageCache';
import { RemoteSceneApplier } from '../../src/app/remote-view/RemoteSceneApplier';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { remoteScene, remoteToken } from './remoteSceneFixtures';

/**
 * A remote view's fog is fed from outside, often (a lit scene's darkness changes on its own). Atlas's fog renderer
 * (#300) keeps one view's committed coverage in a `FogCoverageCache`, keyed by the fog record's identity and grown by an
 * appended operation. The remote view's scene applier hands the same record while its operations stay the same, so
 * feeding the scene again works nothing out anew, and one more operation is applied to the coverage there was.
 */

const rect = (id: string, timestamp: number, x: number): FogOperation => ({
  id, kind: 'fog', type: 'rectangle', timestamp, isErasing: false, x, y: 0, width: 50, height: 50,
});

function setup(): { store: ReturnType<typeof createViewAtlasStore>; applier: RemoteSceneApplier } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-fog', undefined, false, { remote: true });
  return { store, applier: new RemoteSceneApplier(store, 'remote:remote-fog') };
}

describe("a remote view's fed fog and the coverage cache", () => {
  it('feeding the same fog again keeps the record, so the coverage is not worked out again', () => {
    const { store, applier } = setup();
    const fog = { a: rect('a', 1, 0), b: rect('b', 2, 100) };
    applier.apply(remoteScene({ objects: { tokens: { t1: remoteToken('t1') }, texts: {}, drawings: {}, fog } }));
    const cache = new FogCoverageCache();
    const fogBefore = store.getState().objects.fog;
    const first = cache.get(fogBefore, store.getState().mapPath);
    // The token moved; the fog's operations are handed again (`RecordMemo` keeps records by the objects handed).
    applier.apply(remoteScene({ objects: { tokens: { t1: remoteToken('t1', { x: 300 }) }, texts: {}, drawings: {}, fog: { ...fog } } }));
    // The same coverage object: the cache saw the same record (a recomputation would build a new one).
    expect(store.getState().objects.fog).toBe(fogBefore);
    expect(cache.get(store.getState().objects.fog, store.getState().mapPath)).toBe(first);
  });

  it('one more operation grows the coverage it had', () => {
    const { store, applier } = setup();
    const fog = { a: rect('a', 1, 0), b: rect('b', 2, 100) };
    applier.apply(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog } }));
    const cache = new FogCoverageCache();
    const before = cache.get(store.getState().objects.fog, store.getState().mapPath);
    applier.apply(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog: { ...fog, c: rect('c', 3, 300) } } }));
    const after = cache.get(store.getState().objects.fog, store.getState().mapPath);
    expect(after).not.toBe(before);
    expect(after?.covers({ x: 25, y: 25 })).toBe(true);
    expect(after?.covers({ x: 325, y: 25 })).toBe(true);
    expect(after?.covers({ x: 225, y: 25 })).toBe(false);
  });
});
