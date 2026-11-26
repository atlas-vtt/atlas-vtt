import { describe, expect, it } from 'vitest';
import { isFollower, readMeasure } from '../../../src/app/measure/keptMeasures';
import { anchorOf, followTokensWithMeasures, followerMoves, pointsCarried } from '../../../src/app/measure/measureFollowers';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const near = (points: readonly { x: number; y: number }[]): { x: number; y: number }[] => points.map(({ x, y }) => ({ x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 }));

describe('a measurement grouped with a token', () => {
  it('is carried and turned about its token, keeping its shape', () => {
    // A cone from the token's right edge, pointing right; the token turns a quarter clockwise and moves.
    const cone = [{ x: 135, y: 100 }, { x: 275, y: 100 }];
    const carried = pointsCarried(cone, { x: 100, y: 100, rotation: 0 }, { x: 300, y: 200, rotation: 90 });
    expect(near(carried)).toEqual([{ x: 300, y: 235 }, { x: 300, y: 375 }]);
  });

  it('is read only with its token and anchor, and never as an aura', () => {
    const grouped = { id: 'm', kind: 'measure', shape: 'cone', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], follows: 't', anchor: { x: 0, y: 0, rotation: 0 } };
    expect(isFollower(readMeasure('m', grouped)!)).toBe(true);
    const { anchor: _, ...alone } = grouped;
    expect(readMeasure('m', alone)).not.toHaveProperty('follows');
    expect(readMeasure('m', { ...grouped, anchor: { x: 0, y: 0 } })).not.toHaveProperty('follows');
  });

  it('moves only where its token moved or turned', () => {
    const measures = { m: { id: 'm', kind: 'measure', shape: 'line', width: 70, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], follows: 't', anchor: { x: 0, y: 0, rotation: 0 } } };
    expect(followerMoves(measures, { t: { x: 0, y: 0 } })).toEqual([]);
    expect(followerMoves(measures, { other: { x: 5, y: 5 } })).toEqual([]);
    const [move] = followerMoves(measures, { t: { x: 5, y: 5, rotation: 180 } });
    expect(near(move!.points)).toEqual([{ x: 5, y: 5 }, { x: -5, y: 5 }]);
    expect(move!.anchor).toEqual({ x: 5, y: 5, rotation: 180 });
  });

  it('follows its token in the store, in the token\'s own undo step, and goes with it', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `followers-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/followers.atlasmap');
    const hero: TokenEntity = { id: 'hero', kind: 'character', name: 'hero', imagePath: '', x: 105, y: 105 };
    store.setState({ objects: { ...store.getState().objects, tokens: { hero } } });
    const stop = followTokensWithMeasures(store);
    const id = store.getState().addMeasure({ shape: 'cone', points: [{ x: 140, y: 105 }, { x: 280, y: 105 }], follows: 'hero', anchor: anchorOf(hero) })!;
    const history = getHistoryStore(store)!;
    history.getState().clear();
    const cone = (): KeptMeasure | undefined => store.getState().objects.measures?.[id];

    store.getState().moveToken('hero', 205, 105);
    expect(cone()?.points).toEqual([{ x: 240, y: 105 }, { x: 380, y: 105 }]);
    expect(cone()?.shape).toBe('cone');
    expect(history.getState().pastStates).toHaveLength(1);

    store.getState().updateTokens([{ id: 'hero', changes: { rotation: 90 } }]);
    expect(near(cone()!.points)).toEqual([{ x: 205, y: 140 }, { x: 205, y: 280 }]);

    // Undo puts token and cone back together; nothing is written after it.
    history.getState().undo();
    history.getState().undo();
    expect(cone()?.points).toEqual([{ x: 140, y: 105 }, { x: 280, y: 105 }]);
    expect(history.getState().futureStates).toHaveLength(2);

    store.getState().deleteToken('hero');
    expect(cone()).toBeUndefined();
    stop();
  });
});
