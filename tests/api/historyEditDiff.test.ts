/**
 * Atlas #324 (undo only what an edit changed) and the API's writes: a `tokens.move` is exactly one undo step that takes
 * back the moves and the layer raise and nothing Atlas wrote since; an extension's scene data never enters a view's history.
 */
import { describe, expect, it } from 'vitest';
import { tokensApi } from '../../src/api/tokens';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, runUntracked } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeView, loadMap, makeToken, trackerWith } from './apiFakes';
import { withScene } from './scenesFixture';

function movable() {
  const view = fakeView('v1');
  view.atlasStore.setState((state) => ({
    grid: { ...state.grid!, size: 70, offsetX: 0, offsetY: 0, type: 'square', enabled: true, snapToGrid: true },
    objects: { ...state.objects, tokens: {
      a: { ...makeToken('a'), x: 35, y: 35, size: 1, layer: 0 },
      b: { ...makeToken('b'), x: 105, y: 35, size: 1, layer: 1 },
      c: { ...makeToken('c'), x: 175, y: 35, size: 1, layer: 2 },
    } },
  }));
  loadMap(view);
  return { view, tokens: tokensApi(trackerWith([view]).tracker), history: getHistoryStore(view.atlasStore)! };
}

const tokenState = (view: ReturnType<typeof fakeView>, id: string) => view.atlasStore.getState().objects.tokens[id]!;

describe('the API under edit-diff undo (#324)', () => {
  it('tokens.move is exactly one undo step: undo takes back the moves and the raise, redo makes them again', () => {
    const { view, tokens, history } = movable();
    const before = history.getState().pastStates.length;
    expect(tokens.move('v1', [{ tokenId: 'a', x: 150, y: 150 }, { tokenId: 'b', x: 220, y: 80 }]).ok).toBe(true);
    expect(history.getState().pastStates.length).toBe(before + 1);
    const moved = { a: { ...tokenState(view, 'a') }, b: { ...tokenState(view, 'b') } };
    expect(moved.a.layer!).toBeGreaterThan(tokenState(view, 'c').layer!);
    history.getState().undo();
    expect(history.getState().pastStates.length).toBe(before);
    expect(tokenState(view, 'a')).toMatchObject({ x: 35, y: 35, layer: 0 });
    expect(tokenState(view, 'b')).toMatchObject({ x: 105, y: 35, layer: 1 });
    expect(tokenState(view, 'c')).toMatchObject({ x: 175, y: 35, layer: 2 });
    history.getState().redo();
    expect(tokenState(view, 'a')).toMatchObject({ x: moved.a.x, y: moved.a.y, layer: moved.a.layer });
    expect(tokenState(view, 'b')).toMatchObject({ x: moved.b.x, y: moved.b.y, layer: moved.b.layer });
    expect(history.getState().pastStates.length).toBe(before + 1);
  });

  it("undoing a move keeps what Atlas wrote by itself since, to a token the move did not change", () => {
    const { view, tokens, history } = movable();
    expect(tokens.move('v1', [{ tokenId: 'a', x: 150, y: 150 }]).ok).toBe(true);
    const steps = history.getState().pastStates.length;
    // As Atlas following a renamed image file: its own write, never an undo step.
    runUntracked(view.atlasStore, () => view.atlasStore.setState((state) => ({
      objects: { ...state.objects, tokens: { ...state.objects.tokens, c: { ...state.objects.tokens.c!, imagePath: 'tokens/renamed.png' } } },
    })));
    expect(history.getState().pastStates.length).toBe(steps);
    history.getState().undo();
    expect(tokenState(view, 'a')).toMatchObject({ x: 35, y: 35 });
    expect(tokenState(view, 'c').imagePath).toBe('tokens/renamed.png');
  });

  it("an extension's scene data never enters the history of a view holding that scene", async () => {
    const view = fakeView('v1');
    const { tracker } = trackerWith([view]);
    const { scenes, sceneId, mapPath } = await withScene(tracker);
    view.atlasStore.setState({ mapPath, mapLoaded: true, isMapLoading: false });
    const history = getHistoryStore(view.atlasStore)!;
    const before = history.getState().pastStates.length;
    const objects = view.atlasStore.getState().objects;
    await scenes.setData(sceneId, { item: 'abc' });
    await scenes.setData(sceneId, null);
    expect(history.getState().pastStates.length).toBe(before);
    expect(view.atlasStore.getState().objects).toBe(objects);
  });
});
