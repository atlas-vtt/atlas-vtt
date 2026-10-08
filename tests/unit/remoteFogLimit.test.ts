import { describe, expect, it } from 'vitest';
import { FogCoverageCache } from '../../src/app/fog/FogCoverageCache';
import { validateFogOperation } from '../../src/app/fog/fogOperationShape';
import { calculateOperationBounds } from '../../src/app/pixi/fog/fogRenderUtils';
import { isFogTooLarge, REMOTE_FOG_OP_POINTS_MAX, REMOTE_FOG_OPS_MAX, REMOTE_FOG_POINTS_MAX } from '../../src/app/remote-view/remoteInput';
import { RemoteSceneApplier } from '../../src/app/remote-view/RemoteSceneApplier';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { remoteScene } from './remoteSceneFixtures';

/**
 * Since #300 fog is one clipped coverage, replayed whole on most changes: about 250 ms for 400 operations and 15 s for
 * 2,000 in this environment. A remote view bounds that work: more than `REMOTE_FOG_OPS_MAX` operations show as fog over
 * everything (fail closed), and fog handed again equal by value is not worked out again.
 */

const brush = (id: string, timestamp: number, x: number, y: number): FogOperation => ({
  id, kind: 'fog', type: 'brush', timestamp, isErasing: timestamp % 3 === 0, brushRadius: 30,
  points: [{ x, y }, { x: x + 40, y: y + 25 }, { x: x + 80, y }],
});

function fogOf(count: number): Record<string, FogOperation> {
  const fog: Record<string, FogOperation> = {};
  for (let i = 0; i < count; i++) fog[`op${i}`] = brush(`op${i}`, i + 1, (i * 37) % 1000, (i * 53) % 800);
  return fog;
}

function setup(): { store: ReturnType<typeof createViewAtlasStore>; applier: RemoteSceneApplier } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-fog-limit', undefined, false, { remote: true });
  return { store, applier: new RemoteSceneApplier(store, 'remote:remote-fog-limit') };
}

const sceneWith = (fog: Record<string, FogOperation>): ReturnType<typeof remoteScene> =>
  remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog } });

describe("a remote view's fog work is bounded", () => {
  it('the cap is 2,000 operations: that many are shown as given', () => {
    expect(REMOTE_FOG_OPS_MAX).toBe(2000);
    const { store, applier } = setup();
    applier.apply(sceneWith(fogOf(REMOTE_FOG_OPS_MAX)));
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(REMOTE_FOG_OPS_MAX);
  });

  it('more fails closed: fog Atlas refuses to draw, which covers the whole view, worked out at once', () => {
    const { store, applier } = setup();
    const started = performance.now();
    applier.apply(sceneWith(fogOf(REMOTE_FOG_OPS_MAX + 1)));
    const fog = store.getState().objects.fog;
    expect(Object.keys(fog)).toEqual(['atlas-remote-fog-limit']);
    // Refused geometry: the compositor covers its whole canvas and every token counts as covered (#303).
    expect(() => validateFogOperation(fog['atlas-remote-fog-limit']!)).toThrow(RangeError);
    expect(new FogCoverageCache().get(fog, store.getState().mapPath)).toBeNull();
    // Nothing to size a canvas from: no points, so no bounds and no hit-test canvas.
    expect(calculateOperationBounds(fog['atlas-remote-fog-limit']!)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    // Bounded: copying 2,001 operations and replaying them would take seconds.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('back under the cap, the scene shows its own fog again', () => {
    const { store, applier } = setup();
    applier.apply(sceneWith(fogOf(REMOTE_FOG_OPS_MAX + 1)));
    applier.apply(sceneWith(fogOf(3)));
    expect(Object.keys(store.getState().objects.fog)).toEqual(['op0', 'op1', 'op2']);
  });

  it('fog equal by value, handed as new objects, keeps its record, so the coverage is not worked out again', () => {
    const { store, applier } = setup();
    const fog = fogOf(400);
    applier.apply(sceneWith(fog));
    const cache = new FogCoverageCache();
    const record = store.getState().objects.fog;
    const first = cache.get(record, store.getState().mapPath);
    const started = performance.now();
    for (let i = 0; i < 5; i++) applier.apply(sceneWith(structuredClone(fog)));
    expect(store.getState().objects.fog).toBe(record);
    expect(cache.get(store.getState().objects.fog, store.getState().mapPath)).toBe(first);
    // Five comparisons of 400 operations, no replay (one replay alone takes about 250 ms here).
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('one operation changed by value gives a new record that keeps every other copy', () => {
    const { store, applier } = setup();
    const fog = fogOf(5);
    applier.apply(sceneWith(fog));
    const before = store.getState().objects.fog;
    const next = structuredClone(fog);
    next.op4 = { ...next.op4!, isErasing: !next.op4!.isErasing };
    applier.apply(sceneWith(next));
    const after = store.getState().objects.fog;
    expect(after).not.toBe(before);
    expect(after.op4?.isErasing).toBe(!before.op4?.isErasing);
    for (const id of ['op0', 'op1', 'op2', 'op3']) expect(after[id]).toBe(before[id]);
  });
});

/** A lasso along `count` points; its points are a plain array unless `untouchable`, whose items throw when read. */
function lasso(id: string, count: number, untouchable = false): FogOperation {
  const points = Array.from({ length: count }, (_, i) => ({ x: (i * 7) % 1000, y: (i * 13) % 800 }));
  const guarded = untouchable ? new Proxy(points, { get: (target, key) => (key === 'length' || typeof key === 'symbol' ? Reflect.get(target, key) as unknown : (() => { throw new Error('a point was read'); })()) }) : points;
  return { id, kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points: guarded };
}

const isCovered = (store: ReturnType<typeof setup>['store']): boolean => Object.keys(store.getState().objects.fog).join() === 'atlas-remote-fog-limit';

describe("a remote view's fog points and brushes are bounded too", () => {
  it('the limits: 200,000 points in all, 10,000 in one operation', () => {
    expect(REMOTE_FOG_POINTS_MAX).toBe(200_000);
    expect(REMOTE_FOG_OP_POINTS_MAX).toBe(10_000);
  });

  it('one operation over 10,000 points covers the whole map, worked out without reading a point', () => {
    const { store, applier } = setup();
    applier.apply(sceneWith({ a: lasso('a', REMOTE_FOG_OP_POINTS_MAX) }));
    expect(isCovered(store)).toBe(false);
    const started = performance.now();
    applier.apply(sceneWith({ a: lasso('a', REMOTE_FOG_OP_POINTS_MAX + 1, true) }));
    expect(isCovered(store)).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('more than 200,000 points in all, under both other caps, covers the whole map, in bounded time and without reading a point', () => {
    const fog: Record<string, FogOperation> = {};
    for (let i = 0; i < 20; i++) fog[`f${i}`] = lasso(`f${i}`, REMOTE_FOG_OP_POINTS_MAX, true);
    expect(isFogTooLarge(sceneWith(fog))).toBe(false);
    fog.extra = lasso('extra', 1, true);
    const { store, applier } = setup();
    const started = performance.now();
    applier.apply(sceneWith(fog));
    expect(isCovered(store)).toBe(true);
    // No copy, no replay of 200,001 points: counting lengths only.
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("a brush wider than the map's longer side covers it; while the map's size is unknown, wider than a remote map may be", () => {
    const brush = (radius: number): FogOperation => ({ id: 'b', kind: 'fog', type: 'brush', timestamp: 1, isErasing: false, brushRadius: radius, points: [{ x: 1, y: 1 }] });
    // The fixture's map is 1000 × 800.
    expect(isFogTooLarge(sceneWith({ b: brush(1000) }))).toBe(false);
    expect(isFogTooLarge(sceneWith({ b: brush(1001) }))).toBe(true);
    const unknownSize = { ...sceneWith({ b: brush(50_000) }), background: { url: null, width: 0, height: 0 } };
    expect(isFogTooLarge(unknownSize)).toBe(false);
    expect(isFogTooLarge({ ...unknownSize, objects: { ...unknownSize.objects, fog: { b: brush(100_001) } } })).toBe(true);
    const { store, applier } = setup();
    applier.apply(sceneWith({ b: brush(1001) }));
    expect(isCovered(store)).toBe(true);
  });

  it('an operation whose fields cannot be read counts as too much fog', () => {
    const hostile = { get points(): never { throw new Error('getter'); } } as unknown as FogOperation;
    expect(isFogTooLarge(sceneWith({ h: hostile }))).toBe(true);
  });

  it("counts Atlas's copy too, so a getter that answers short for the check and long for the copy still covers the map", () => {
    const { store, applier } = setup();
    let reads = 0;
    const long = Array.from({ length: REMOTE_FOG_OP_POINTS_MAX + 1 }, (_, i) => ({ x: i % 900, y: i % 700 }));
    const lying = { id: 'l', kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, get points() { reads += 1; return reads === 1 ? [{ x: 1, y: 1 }] : long; } };
    applier.apply(sceneWith({ l: lying as unknown as FogOperation }));
    expect(isCovered(store)).toBe(true);
    expect(applier.fogTooLarge).toBe(true);
    applier.apply(sceneWith(fogOf(3)));
    expect(applier.fogTooLarge).toBe(false);
  });
});
