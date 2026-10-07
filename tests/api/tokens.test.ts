import { describe, expect, it } from 'vitest';
import { tokensApi } from '../../src/api/tokens';
import { getHistoryStore } from '../../src/app/stores/history';
import { fakeView, loadMap, makeToken, trackerWith, type FakeView } from './apiFakes';

function sceneWithTokens(view: FakeView, grid: Record<string, unknown> = {}): void {
  view.atlasStore.setState((state) => ({
    grid: { ...state.grid!, size: 70, offsetX: 0, offsetY: 0, type: 'square', enabled: true, snapToGrid: true, ...grid },
    objects: { ...state.objects, tokens: {
      a: { ...makeToken('a'), x: 35, y: 35, size: 1 },
      b: { ...makeToken('b'), x: 105, y: 35, size: 1 },
      big: { ...makeToken('big'), x: 210, y: 210, size: 2 },
      hidden: { ...makeToken('hidden'), x: 35, y: 105, size: 1, isHidden: true },
    } },
  }));
  loadMap(view);
}

function setup(grid?: Record<string, unknown>): { view: FakeView; tokens: ReturnType<typeof tokensApi> } {
  const view = fakeView('v1');
  sceneWithTokens(view, grid);
  return { view, tokens: tokensApi(trackerWith([view]).tracker) };
}

describe('tokens', () => {
  it('C-tok-1: refusals and one undo step', () => {
    const view = fakeView('v1');
    const tokens = tokensApi(trackerWith([view]).tracker);
    expect(tokens.move('v1', [{ tokenId: 'a', x: 0, y: 0 }])).toEqual({ ok: false, reason: 'not-loaded' });
    sceneWithTokens(view);
    expect(tokens.move('v1', [{ tokenId: 'zzz', x: 0, y: 0 }])).toEqual({ ok: false, reason: 'unknown-token' });
    expect(tokens.move('v1', [{ tokenId: 'hidden', x: 0, y: 0 }])).toEqual({ ok: false, reason: 'hidden' });
    expect(tokens.move('v1', [{ tokenId: 'a', x: Number.NaN, y: 0 }])).toEqual({ ok: false, reason: 'invalid-position' });
    expect(tokens.move('v1', [{ tokenId: 'a', x: 140, y: 140 }, { tokenId: 'zzz', x: 0, y: 0 }])).toEqual({ ok: false, reason: 'unknown-token' });
    expect(view.atlasStore.getState().objects.tokens.a!.x).toBe(35);
    const result = tokens.move('v1', [{ tokenId: 'a', x: 150, y: 150 }, { tokenId: 'b', x: 220, y: 80 }]);
    expect(result).toEqual({ ok: true, positions: { a: { x: 175, y: 175 }, b: { x: 245, y: 105 } } });
    const history = getHistoryStore(view.atlasStore)!;
    const before = history.getState().pastStates.length;
    history.getState().undo();
    expect(history.getState().pastStates.length).toBe(before - 1);
    expect(view.atlasStore.getState().objects.tokens.a!.x).toBe(35);
    expect(view.atlasStore.getState().objects.tokens.b!.x).toBe(105);
    expect(tokens.move('v1', [{ tokenId: 'hidden', x: 0, y: 0 }], { allowHidden: true }).ok).toBe(true);
  });

  it('C-tok-2: snapPoint as the GM drag: unchanged without grid or snapping, corners for a 2x2 footprint (size 1.5), a switched-off grid still snaps', () => {
    const { view, tokens } = setup();
    expect(tokens.snapPoint('v1', { x: 10, y: 10 }, 1)).toEqual({ x: 35, y: 35 });
    expect(tokens.snapPoint('v1', { x: 60, y: 60 }, 1.5)).toEqual({ x: 70, y: 70 });
    expect(tokens.snapPoint('v1', { x: 60, y: 60 }, 2)).toEqual({ x: 35, y: 35 });
    view.atlasStore.getState().setGridVisible(false);
    expect(tokens.snapPoint('v1', { x: 10, y: 10 }, 1)).toEqual({ x: 35, y: 35 });
    view.atlasStore.getState().setSnapToGrid(false);
    expect(tokens.snapPoint('v1', { x: 10, y: 10 }, 1)).toEqual({ x: 10, y: 10 });
    expect(tokens.snapPoint('nope', { x: 10, y: 10 }, 1)).toEqual({ x: 10, y: 10 });
  });

  it('snaps a move by the token own size, on hex grids too, where snapPoint says it lands', () => {
    for (const type of ['square', 'hex-vertical', 'hex-horizontal']) {
      const { view, tokens } = setup({ type, offsetX: 13, offsetY: 29 });
      for (const [id, size] of [['a', 1], ['big', 2]] as const) {
        const result = tokens.move('v1', [{ tokenId: id, x: 301.3, y: 402.7 }], { clampToMap: false });
        expect(result).toEqual({ ok: true, positions: { [id]: tokens.snapPoint('v1', { x: 301.3, y: 402.7 }, size) } });
      }
      expect(view.atlasStore.getState().objects.tokens.a!.x).toBe(tokens.snapPoint('v1', { x: 301.3, y: 402.7 }, 1).x);
    }
  });

  it('keeps the final position on the map unless told not to, and leaves a map without a size alone', () => {
    const { tokens } = setup();
    expect(tokens.move('v1', [{ tokenId: 'a', x: -500, y: 9999 }])).toEqual({ ok: true, positions: { a: { x: 35, y: 455 } } });
    expect(tokens.move('v1', [{ tokenId: 'a', x: -500, y: 9999 }], { clampToMap: false, snap: false })).toEqual({ ok: true, positions: { a: { x: -500, y: 9999 } } });
    const view = fakeView('v2');
    sceneWithTokens(view);
    (view.renderer as { getBackgroundSprite: () => null }).getBackgroundSprite = () => null;
    expect(tokensApi(trackerWith([view]).tracker).move('v2', [{ tokenId: 'a', x: -500, y: 9999 }], { snap: false })).toEqual({ ok: true, positions: { a: { x: -500, y: 9999 } } });
  });

  it('lands on the nearest snapped position inside the map on an offset grid, at both corners', () => {
    const { tokens } = setup({ offsetX: 13, offsetY: 29 });
    expect(tokens.move('v1', [{ tokenId: 'a', x: 0, y: 0 }])).toEqual({ ok: true, positions: { a: { x: 48, y: 64 } } });
    expect(tokens.move('v1', [{ tokenId: 'a', x: 1000, y: 500 }])).toEqual({ ok: true, positions: { a: { x: 958, y: 484 } } });
    expect(tokens.move('v1', [{ tokenId: 'a', x: 1000, y: 500 }], { clampToMap: false })).toEqual({ ok: true, positions: { a: { x: 1028, y: 484 } } });
  });

  it('keeps tokens of every size on the map, and on the grid, on hex grids too', () => {
    for (const type of ['square', 'hex-vertical', 'hex-horizontal']) {
      const { view, tokens } = setup({ type, offsetX: 13, offsetY: 29 });
      view.atlasStore.setState((state) => ({
        objects: { ...state.objects, tokens: { ...state.objects.tokens, huge: { ...makeToken('huge'), size: 3 }, large: { ...makeToken('large'), size: 1.5 } } },
      }));
      for (const id of ['a', 'large', 'huge']) {
        const size = view.atlasStore.getState().objects.tokens[id]!.size ?? 1;
        for (const corner of [{ x: 0, y: 0 }, { x: 1000, y: 500 }, { x: -50, y: 700 }, { x: 1300, y: -20 }]) {
          const result = tokens.move('v1', [{ tokenId: id, ...corner }]);
          if (!result.ok) throw new Error('expected a move');
          const landed = result.positions[id]!;
          expect(landed.x >= 0 && landed.x <= 1000 && landed.y >= 0 && landed.y <= 500).toBe(true);
          const again = tokens.snapPoint('v1', landed, size);
          expect(again.x).toBeCloseTo(landed.x, 6);
          expect(again.y).toBeCloseTo(landed.y, 6);
        }
      }
    }
  });

  it('puts the moved token on top and releases held tokens, as one undo step that restores the stack', () => {
    const { view, tokens } = setup();
    const layers = (): Record<string, number> => Object.fromEntries(Object.entries(view.atlasStore.getState().objects.tokens).map(([id, t]) => [id, t.layer ?? 0]));
    const before = layers();
    view.atlasStore.setState({ heldTokens: { a: true } } as never);
    expect(tokens.move('v1', [{ tokenId: 'a', x: 150, y: 150 }]).ok).toBe(true);
    const after = layers();
    expect(Object.entries(after).filter(([id]) => id !== 'a').every(([, layer]) => after.a! > layer)).toBe(true);
    expect(view.atlasStore.getState().heldTokens).toEqual({});
    getHistoryStore(view.atlasStore)!.getState().undo();
    expect(layers()).toEqual(before);
  });

  it('writes nothing, and leaves no undo step, when any move is refused', () => {
    const { view, tokens } = setup();
    const history = getHistoryStore(view.atlasStore)!;
    const before = history.getState().pastStates.length;
    const tokensBefore = view.atlasStore.getState().objects.tokens;
    for (const x of [Number.POSITIVE_INFINITY, '5', null, undefined, {}]) {
      expect(tokens.move('v1', [{ tokenId: 'b', x: 140, y: 140 }, { tokenId: 'a', x, y: 0 } as never])).toEqual({ ok: false, reason: 'invalid-position' });
    }
    for (const entry of [null, 5, 'a', {}, { tokenId: 7, x: 1, y: 1 }]) {
      expect(tokens.move('v1', [entry as never])).toEqual({ ok: false, reason: 'unknown-token' });
    }
    expect(view.atlasStore.getState().objects.tokens).toBe(tokensBefore);
    expect(history.getState().pastStates.length).toBe(before);
  });

  it('refuses a position beyond 1e9, or that overflows when snapped, and ids that are not tokens of this map', () => {
    const { view, tokens } = setup({ type: 'hex-vertical' });
    const tokensBefore = view.atlasStore.getState().objects.tokens;
    expect(tokens.move('v1', [{ tokenId: 'a', x: Number.MAX_VALUE, y: Number.MAX_VALUE }], { clampToMap: false })).toEqual({ ok: false, reason: 'invalid-position' });
    expect(tokens.move('v1', [{ tokenId: 'a', x: 2e9, y: 0 }], { clampToMap: false, snap: false })).toEqual({ ok: false, reason: 'invalid-position' });
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(tokens.move('v1', [{ tokenId: id, x: 1, y: 1 }])).toEqual({ ok: false, reason: 'unknown-token' });
    }
    expect(view.atlasStore.getState().objects.tokens).toBe(tokensBefore);
  });

  it('validates its arguments, moves a token named twice to its last position, and ignores an empty list', () => {
    const { view, tokens } = setup();
    expect(() => tokens.move('v1', 'a' as never)).toThrow(/moves/);
    expect(() => tokens.move('v1', null as never)).toThrow(/moves/);
    expect(() => tokens.move('v1', [], 5 as never)).toThrow(/options/);
    expect(() => tokens.move('v1', [], { snap: 'yes' } as never)).toThrow(/snap/);
    expect(() => tokens.snapPoint('v1', { x: Number.NaN, y: 0 }, 1)).toThrow(/point/);
    expect(() => tokens.snapPoint('v1', null as never, 1)).toThrow(/point/);
    expect(() => tokens.snapPoint('v1', { x: 0, y: 0 }, 0)).toThrow(/tokenSize/);
    expect(() => tokens.snapPoint('v1', { x: 0, y: 0 }, Number.NaN)).toThrow(/tokenSize/);
    const history = getHistoryStore(view.atlasStore)!;
    const before = history.getState().pastStates.length;
    expect(tokens.move('v1', [])).toEqual({ ok: true, positions: {} });
    expect(history.getState().pastStates.length).toBe(before);
    const twice = tokens.move('v1', [{ tokenId: 'a', x: 0, y: 0 }, { tokenId: 'a', x: 150, y: 150 }]);
    expect(twice).toEqual({ ok: true, positions: { a: { x: 175, y: 175 } } });
  });

  it('gives frozen results, and a closed view is not loaded', () => {
    const { view, tokens } = setup();
    expect(Object.isFrozen(tokens.snapPoint('v1', { x: 10, y: 10 }, 1))).toBe(true);
    const unchanged = { x: 3, y: 4 };
    expect(tokens.snapPoint('nope', unchanged, 1)).not.toBe(unchanged);
    const moved = tokens.move('v1', [{ tokenId: 'a', x: 1, y: 1 }]);
    if (!moved.ok) throw new Error('expected a move');
    expect(Object.isFrozen(moved.positions) && Object.isFrozen(moved.positions.a)).toBe(true);
    view.close();
    expect(tokens.move('v1', [{ tokenId: 'a', x: 1, y: 1 }])).toEqual({ ok: false, reason: 'not-loaded' });
  });
});
