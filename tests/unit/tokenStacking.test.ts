import { afterEach, describe, expect, it, vi } from 'vitest';
import { produce } from 'immer';
import { Texture } from 'pixi.js';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';
import { collectMapObjects } from '../../src/app/clipboard/mapObjectContent';
import { getHistoryStore } from '../../src/app/stores/history';
import { placeTokens, raiseTokens } from '../../src/app/stores/tokenStacking';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SQUARE = { x: 105, y: 105 };
const ELSEWHERE = { x: 455, y: 105 };

function token(id: string, at: { x: number; y: number }, layer?: number): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, ...at, ...(layer !== undefined && { layer }) };
}

function record(...tokens: TokenEntity[]): Record<string, TokenEntity> {
  return Object.fromEntries(tokens.map((entry) => [entry.id, entry]));
}

/** The tokens' ids as the map draws them, bottom first. */
function stack(tokens: Record<string, TokenEntity>): string[] {
  return Object.values(tokens).sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0)).map((entry) => entry.id);
}

function createStore(...tokens: TokenEntity[]): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `token-stacking-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: record(...tokens) } });
  getHistoryStore(store)?.getState().clear();
  return store;
}

describe('raiseTokens', () => {
  it('puts a token above every other', () => {
    const tokens = record(token('a', SQUARE), token('b', SQUARE, 3), token('c', ELSEWHERE, 7));
    raiseTokens(tokens, ['a']);
    expect(stack(tokens)).toEqual(['b', 'c', 'a']);
  });

  it('raises a token that only ties with the top one', () => {
    const tokens = record(token('a', SQUARE, 2), token('b', SQUARE, 2));
    raiseTokens(tokens, ['a']);
    expect(tokens.a!.layer).toBeGreaterThan(tokens.b!.layer!);
  });

  it('leaves tokens alone that already lie on top', () => {
    const tokens = record(token('a', SQUARE, 4), token('b', SQUARE, 1), token('c', SQUARE, 5));
    raiseTokens(tokens, ['a', 'c']);
    expect(tokens).toEqual(record(token('a', SQUARE, 4), token('b', SQUARE, 1), token('c', SQUARE, 5)));
  });

  it('leaves a map\'s only token alone', () => {
    const tokens = record(token('a', SQUARE));
    raiseTokens(tokens, ['a']);
    expect(tokens.a).toEqual(token('a', SQUARE));
  });

  it('keeps the order a group lies in among itself', () => {
    const tokens = record(token('a', SQUARE, 6), token('b', SQUARE, 9), token('c', SQUARE, 2), token('d', SQUARE, 4));
    raiseTokens(tokens, ['c', 'a']);
    expect(stack(tokens)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('ignores ids that are not tokens', () => {
    const tokens = record(token('a', SQUARE), token('b', SQUARE));
    raiseTokens(tokens, ['drawing_1', 'a']);
    expect(stack(tokens)).toEqual(['b', 'a']);
  });
});

describe('placeTokens', () => {
  const scene = (): { objects: { tokens: Record<string, TokenEntity> }; heldTokens: Record<string, { x: number; y: number }>; _audioDirty: boolean } => ({
    objects: { tokens: record(token('a', ELSEWHERE), token('b', SQUARE, 3), token('c', ELSEWHERE, 1)) },
    heldTokens: { a: ELSEWHERE },
    _audioDirty: false,
  });

  it('puts each token at its place and the group on top, and flags the move for spatial audio', () => {
    const placed = produce(scene(), (draft) => placeTokens(draft, [{ id: 'c', ...SQUARE }, { id: 'a', ...SQUARE }, { id: 'drawing_1', x: 0, y: 0 }]));
    expect(placed.objects.tokens.a).toMatchObject(SQUARE);
    expect(placed.objects.tokens.c).toMatchObject(SQUARE);
    expect(stack(placed.objects.tokens)).toEqual(['b', 'a', 'c']);
    expect(placed._audioDirty).toBe(true);
  });

  it('changes nothing but the listed tokens and the audio flag', () => {
    const before = scene();
    const placed = produce(before, (draft) => placeTokens(draft, [{ id: 'a', ...SQUARE }]));
    expect(placed.heldTokens).toBe(before.heldTokens);
    expect(placed.objects.tokens.b).toBe(before.objects.tokens.b);
    expect(placed.objects.tokens.c).toBe(before.objects.tokens.c);
  });
});

describe('tokens put on the map', () => {
  it('places a new token above the tokens that lie there', () => {
    const store = createStore(token('old', SQUARE, 5), token('other', ELSEWHERE, 2));
    const id = store.getState().addToken({ imagePath: 'new.png', ...SQUARE });
    expect(stack(store.getState().objects.tokens).at(-1)).toBe(id);
  });

  it('places tokens added together above the others, in the order they were given', () => {
    const store = createStore(token('old', SQUARE, 5));
    const ids = store.getState().addTokens([{ imagePath: 'one.png', ...SQUARE }, { imagePath: 'two.png', ...SQUARE }]);
    expect(stack(store.getState().objects.tokens)).toEqual(['old', ...ids]);
  });

  it('places copies above their originals and keeps their order', () => {
    const store = createStore(token('low', SQUARE, 1), token('high', SQUARE, 2), token('top', ELSEWHERE, 9));
    const { objects, insertMapObjects } = store.getState();
    const [high, low] = insertMapObjects(collectMapObjects(objects, ['high', 'low']));
    expect(stack(store.getState().objects.tokens)).toEqual(['low', 'high', 'top', low, high]);
  });
});

describe('dropTokens', () => {
  it('moves the tokens, puts them on top and lets go of them in one write', () => {
    const store = createStore(token('a', ELSEWHERE), token('b', SQUARE, 3));
    store.getState().setHeldTokens({ a: ELSEWHERE });
    const writes = vi.fn();
    store.subscribe(writes);

    store.getState().dropTokens([{ id: 'a', ...SQUARE }]);

    const state = store.getState();
    expect(state.objects.tokens.a).toMatchObject(SQUARE);
    expect(stack(state.objects.tokens)).toEqual(['b', 'a']);
    expect(state.heldTokens).toEqual({});
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('is one undo step that puts place and order back', () => {
    const store = createStore(token('a', ELSEWHERE), token('b', SQUARE, 3));
    store.getState().dropTokens([{ id: 'a', ...SQUARE }]);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.tokens).toEqual(record(token('a', ELSEWHERE), token('b', SQUARE, 3)));
  });

  it('leaves the tokens that did not move as they are', () => {
    const store = createStore(token('a', ELSEWHERE), token('b', SQUARE, 3));
    const before = store.getState().objects.tokens.b;
    store.getState().dropTokens([{ id: 'a', ...SQUARE }]);
    expect(store.getState().objects.tokens.b).toBe(before);
  });

  it('keeps the held tokens as they are when none is held', () => {
    const store = createStore(token('a', ELSEWHERE), token('b', SQUARE, 3));
    const before = store.getState().heldTokens;
    store.getState().dropTokens([{ id: 'a', ...SQUARE }]);
    expect(store.getState().heldTokens).toBe(before);
  });
});

describe('dragging a token onto another', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  function drag(store: ViewAtlasStore, tokenId: string, to: { x: number; y: number }): void {
    const handlers = new Map<string, (event: unknown) => void>();
    const viewport = {
      on: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      off: (name: string) => handlers.delete(name),
      toWorld: (point: { x: number; y: number }) => point,
      plugins: { pause: vi.fn(), resume: vi.fn() },
      options: { events: { domElement: document.body.createEl('canvas') } },
    };
    const gridSystem = { snapTokenCenter: (x: number, y: number) => ({ x, y }) };
    const controller = new InteractionController(viewport as never, store, gridSystem as never, {} as never, createInMemoryApp().app, false);
    controller.setTokenSpriteProvider((id) => {
      const entry = store.getState().objects.tokens[id];
      return entry ? { position: { x: entry.x, y: entry.y, set: vi.fn() }, getChildByLabel: () => null } as never : null;
    });

    const from = store.getState().objects.tokens[tokenId]!;
    controller.handleViewportTokenPointerDown(tokenId, { button: 0, shiftKey: false, altKey: false, global: { x: from.x, y: from.y }, stopPropagation: vi.fn() } as never);
    handlers.get('pointermove')?.({ global: to });
    handlers.get('pointerup')?.({ global: to });
  }

  it('puts the dropped token on top of the one that stood there', () => {
    const store = createStore(token('mover', ELSEWHERE), token('resident', SQUARE));
    drag(store, 'mover', SQUARE);
    expect(store.getState().objects.tokens.mover).toMatchObject(SQUARE);
    expect(stack(store.getState().objects.tokens)).toEqual(['resident', 'mover']);
  });

  it('puts the token dropped last on top, whichever was added last', () => {
    const store = createStore(token('first', ELSEWHERE), token('second', { x: 805, y: 105 }), token('resident', SQUARE));
    drag(store, 'second', SQUARE);
    drag(store, 'first', SQUARE);
    expect(stack(store.getState().objects.tokens)).toEqual(['resident', 'second', 'first']);
  });

  it('is undone with the move, as one step', () => {
    const store = createStore(token('mover', ELSEWHERE), token('resident', SQUARE));
    drag(store, 'mover', SQUARE);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.tokens).toEqual(record(token('mover', ELSEWHERE), token('resident', SQUARE)));
  });
});

describe('SpriteFactory', () => {
  it('gives a new token group the place its token has in the stack', async () => {
    const factory = new SpriteFactory({ getOptions: () => ({ size: 70, type: 'square' }) } as never, false);
    // The glass and the ring are painted on a canvas, which jsdom lacks.
    vi.spyOn(factory as never, 'createGlassOverlay').mockImplementation(() => undefined as never);
    vi.spyOn(factory, 'createTokenRing').mockReturnValue(null);
    const group = await factory.createTokenSprite(token('a', SQUARE, 12), Texture.EMPTY);
    expect(group.zIndex).toBe(12);
  });
});
