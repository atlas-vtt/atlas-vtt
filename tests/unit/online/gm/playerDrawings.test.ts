import { describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand';
import { annotationList } from '../../../../src/app/annotations/annotationList';
import { eraserRadius, strokeWidth, textHeight } from '../../../../src/app/annotations/drawSizes';
import { DRAW_BURST, DRAW_MARGIN_CELLS } from '../../../../src/app/online/gm/drawCheck.ts';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { PlayerDrawings, type ToldIds } from '../../../../src/app/online/gm/playerDrawings.ts';
import { clearDrawnBy, drawnBy } from '../../../../src/app/online/gm/playerDrawingsClear.ts';
import {
  MAX_DRAW_NUMBERS, MAX_PLAYER_DRAWING_POINTS, MAX_PLAYER_DRAWINGS, MAX_PLAYER_STROKE_POINTS, MAX_PLAYER_TEXTS, parsePlayerMessage,
  type DrawLook, type DrawTextLook, type GmMessage, type PlayerDrawMessage, type PlayerStroke,
} from '../../../../src/app/online/protocol/index.ts';
import { getHistoryStore, runUntracked, type HistoryState } from '../../../../src/app/stores/history';
import type { DrawingStroke, TextElement } from '../../../../src/app/types';
import { ANA, BEN, SCENE, STORE_FACTORY } from './realStore.ts';

type Request = Exclude<PlayerDrawMessage, PlayerStroke>;
type DrawStore = SceneStore & { getState(): SceneState & { setSelection(ids: string[]): void; selectedIds: string[]; setPersistenceEnabled(enabled: boolean): void } };

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: (app: unknown, viewId: string) => DrawStore };

const CELL = 70;
const MAP = { width: 2000, height: 1500 };
const LOOK: DrawLook = { colour: '#e93147', size: 'm' };
const TEXT_LOOK: DrawTextLook = { colour: '#086ddd', size: 'l', font: 'scifi', look: 'outline', align: 'left' };

interface Table {
  readonly store: DrawStore;
  readonly history: StoreApi<HistoryState>;
  readonly drawings: PlayerDrawings;
  readonly sent: { readonly body: GmMessage; readonly to: string }[];
  /** How often the players were to be told what is theirs. */
  changes: number;
  allowed: boolean;
  seated: Set<string>;
  now: number;
  /** Hands a message to the GM as it would arrive: through the protocol's own reader. */
  send(from: string, message: Request): void;
  drawn(): DrawingStroke[];
  written(): TextElement[];
  /** What a player is told is theirs now, by the ids they name them by. */
  mine(player: string): { drawings: Record<string, string>; texts: Record<string, string> };
  refusals(): string[];
}

/** A real Atlas view store with a loaded scene and a grid of 70 px, and the players' drawings on it: Ana and Ben sit at the table, which lets players draw. */
function table(): Table {
  const store = createViewAtlasStore({}, 'online-draw-test');
  store.getState().setPersistenceEnabled(false);
  runUntracked(store, () => store.setState((draft) => {
    draft.mapLoaded = true;
    draft.grid = { ...(draft.grid ?? {}), enabled: true, size: CELL } as SceneState['grid'];
  }));
  const history = getHistoryStore(store);
  if (history === null) throw new Error('the store has no history');
  history.getState().clear();
  const harness: Table = {
    store, history, sent: [], changes: 0, allowed: true, seated: new Set([ANA, BEN]), now: 0,
    drawings: new PlayerDrawings(store, {
      send: (body, to) => harness.sent.push({ body, to }),
      now: () => harness.now,
      allowed: () => harness.allowed,
      seated: (player) => harness.seated.has(player),
      map: () => MAP,
      changed: () => (harness.changes += 1),
    }),
    send: (from, message) => {
      const read = parsePlayerMessage(JSON.parse(JSON.stringify(message)));
      if (read === null || read.t === 'stroke' || !read.t.startsWith('draw-')) throw new Error(`the protocol refuses ${message.t}`);
      harness.drawings.receive(from, read as Request);
    },
    drawn: () => Object.values(store.getState().objects.drawings),
    written: () => Object.values(store.getState().objects.texts),
    mine: (player) => {
      const { drawings, texts } = store.getState().objects;
      const told: ToldIds = { drawings: Object.keys(drawings), texts: Object.keys(texts) };
      const own = harness.drawings.mine(player, told);
      return {
        drawings: Object.fromEntries(own.drawings.map(({ at, id }) => [id, told.drawings[at]!])),
        texts: Object.fromEntries(own.texts.map(({ at, id }) => [id, told.texts[at]!])),
      };
    },
    refusals: () => harness.sent.flatMap(({ body }) => (body.t === 'draw-refused' ? [body.reason] : [])),
  };
  harness.drawings.setScene(SCENE);
  return harness;
}

let requests = 0;
const next = (): number => (requests += 1);
const flat = (points: readonly (readonly [number, number])[]): number[] => points.flat();
const pen = (points: readonly (readonly [number, number])[], look: DrawLook = LOOK): Request => ({ t: 'draw-add', scene: SCENE, n: next(), mode: 'pen', pts: flat(points), look });
const steps = (history: StoreApi<HistoryState>): number => history.getState().pastStates.length;

describe('a drawing a player makes', () => {
  it('is written as the GM\'s own tool makes it, with who made it, on top, as one undo step', () => {
    const { store, history, send, drawn } = table();
    store.getState().addDrawing({ type: 'pen', points: [{ x: 1, y: 1 }], color: '#ffffff', width: 3, opacity: 1 });
    history.getState().clear();
    send(ANA, pen([[100, 100], [140, 120], [180, 100]], { colour: '#e93147', size: 'l', seeThrough: true }));
    const made = drawn().find((drawing) => drawing.by === ANA);
    expect(made).toMatchObject({ kind: 'drawing', type: 'pen', by: ANA, color: '#e93147', width: strokeWidth('l', CELL), opacity: 0.5, points: [{ x: 100, y: 100 }, { x: 140, y: 120 }, { x: 180, y: 100 }], order: 2 });
    // Who sees it, where it lies, its lock and its group are never a player's to say.
    for (const field of ['hidden', 'layer', 'locked', 'group']) expect(made).not.toHaveProperty(field);
    expect(steps(history)).toBe(1);
    history.getState().undo();
    expect(drawn().some((drawing) => drawing.by === ANA)).toBe(false);
    history.getState().redo();
    expect(drawn().filter((drawing) => drawing.by === ANA)).toHaveLength(1);
  });

  it('is a line with its corners, arrowheads and dashes, a curve through its points, a closed shape with its fill, a rectangle and an ellipse', () => {
    const { send, store } = table();
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: [0, 0, 70, 0, 70, 70], look: { ...LOOK, ends: 'both', dash: 'dashed' } });
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: [0, 0, 70, 0, 70, 70], closed: true, look: { ...LOOK, fill: 'soft', ends: 'end' } });
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: [200, 200, 300, 260, 400, 200], look: { ...LOOK, curved: true } });
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'rectangle', pts: [500, 500, 640, 570], look: { ...LOOK, fill: 'solid', seeThrough: true } });
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'ellipse', pts: [700, 700, 840, 770], look: LOOK });
    const [open, closed, curve, box, round] = annotationList(store.getState().objects);
    expect(open).toMatchObject({ shape: 'line', closed: false, ends: 'both', dash: 'dashed', fill: null });
    expect(closed).toMatchObject({ shape: 'line', closed: true, fill: 'soft', ends: null });
    expect(curve).toMatchObject({ shape: 'line', anchors: [{ x: 200, y: 200 }, { x: 300, y: 260 }, { x: 400, y: 200 }] });
    // A shape's ink is never see-through: the tool has no such switch for it.
    expect(box).toMatchObject({ shape: 'rectangle', fill: 'solid', opacity: 1 });
    expect(round).toMatchObject({ shape: 'ellipse' });
  });

  it('takes a long stroke whose points came ahead in pieces, and refuses one a piece of which is missing', () => {
    const { send, drawn, refusals, drawings } = table();
    const points = Array.from({ length: 500 }, (_, index): [number, number] => [index, 100 + (index % 7)]);
    const most = MAX_DRAW_NUMBERS / 2;
    let n = next();
    send(ANA, { t: 'draw-points', scene: SCENE, n, from: 0, pts: flat(points.slice(0, most)) });
    send(ANA, { t: 'draw-points', scene: SCENE, n, from: most, pts: flat(points.slice(most, 2 * most)) });
    send(ANA, { t: 'draw-add', scene: SCENE, n, mode: 'pen', pts: flat(points.slice(2 * most)), from: 2 * most, look: LOOK });
    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]?.points).toHaveLength(500);
    expect(drawn()[0]?.points[499]).toEqual({ x: 499, y: 100 + (499 % 7) });

    n = next();
    send(ANA, { t: 'draw-points', scene: SCENE, n, from: 0, pts: flat(points.slice(0, most)) });
    // The second piece never arrives.
    send(ANA, { t: 'draw-add', scene: SCENE, n, mode: 'pen', pts: flat(points.slice(2 * most)), from: 2 * most, look: LOOK });
    expect(drawn()).toHaveLength(1);
    expect(refusals()).toEqual(['shape']);
    // Points sent ahead of one request make no drawing of another.
    n = next();
    send(ANA, { t: 'draw-points', scene: SCENE, n, from: 0, pts: [1, 1, 2, 2] });
    send(ANA, pen([[5, 5], [6, 6]]));
    expect(drawn().at(-1)?.points).toEqual([{ x: 5, y: 5 }, { x: 6, y: 6 }]);
    expect(drawings.mine(BEN, { drawings: Object.keys(drawn()), texts: [] }).drawings).toEqual([]);
  });

  it('is refused with more points than a drawing may have, also as a curve that samples to more', () => {
    const { send, drawn, refusals } = table();
    const n = next();
    const many = Array.from({ length: MAX_PLAYER_STROKE_POINTS }, (_, index): [number, number] => [index % 1000, 10]);
    for (let from = 0; from < many.length; from += 200) send(ANA, { t: 'draw-points', scene: SCENE, n, from, pts: flat(many.slice(from, from + 200)) });
    // Two more than a drawing may have.
    send(ANA, { t: 'draw-add', scene: SCENE, n, mode: 'pen', pts: [1, 1, 2, 2], from: many.length, look: LOOK });
    // The protocol itself takes no count of points sent ahead beyond that.
    expect(parsePlayerMessage({ t: 'draw-add', scene: SCENE, n: 1, mode: 'pen', pts: [1, 1], from: MAX_PLAYER_STROKE_POINTS + 1, look: LOOK })).toBeNull();
    const corners = Array.from({ length: 200 }, (_, index): [number, number] => [index * 5, (index % 2) * 50]);
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: flat(corners), look: { ...LOOK, curved: true } });
    expect(drawn()).toHaveLength(0);
    expect(refusals()).toEqual(['shape', 'shape']);
  });

  it('must lie on the map or within two cells of its edge', () => {
    const { send, drawn, refusals } = table();
    const margin = DRAW_MARGIN_CELLS * CELL;
    send(ANA, pen([[-margin, -margin], [MAP.width + margin, MAP.height + margin]]));
    send(ANA, pen([[100, 100], [MAP.width + margin + 1, 100]]));
    send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'rectangle', pts: [-margin - 1, 0, 50, 50], look: LOOK });
    expect(drawn()).toHaveLength(1);
    expect(refusals()).toEqual(['place', 'place']);
  });
});

describe('what the GM refuses whatever a page sends', () => {
  it('takes nothing while players may not draw, and takes it again the moment they may', () => {
    const harness = table();
    harness.allowed = false;
    harness.send(ANA, pen([[10, 10], [20, 20]]));
    harness.send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: 100, y: 100, text: 'Here', look: TEXT_LOOK });
    harness.send(ANA, { t: 'draw-erase', scene: SCENE, n: next(), pts: [10, 10], size: 'xl' });
    expect(harness.drawn()).toHaveLength(0);
    expect(harness.written()).toHaveLength(0);
    expect(harness.refusals()).toEqual(['off', 'off', 'off']);
    expect(steps(harness.history)).toBe(0);
    harness.allowed = true;
    harness.send(ANA, pen([[10, 10], [20, 20]]));
    expect(harness.drawn()).toHaveLength(1);
  });

  it('takes nothing from whoever does not sit at this floor, names another scene, or while the map loads', () => {
    const harness = table();
    harness.send('c'.repeat(20), pen([[10, 10], [20, 20]]));
    harness.send(ANA, { ...pen([[10, 10], [20, 20]]), scene: 'another-floor' });
    runUntracked(harness.store, () => harness.store.setState((draft) => void (draft.isMapLoading = true)));
    harness.send(ANA, pen([[10, 10], [20, 20]]));
    expect(harness.drawn()).toHaveLength(0);
    expect(harness.refusals()).toEqual(['scene', 'scene', 'busy']);
    expect(harness.sent.map(({ to }) => to)).toEqual(['c'.repeat(20), ANA, ANA]);
  });

  it('holds each player to a rate of their own', () => {
    const harness = table();
    for (let index = 0; index < DRAW_BURST + 5; index += 1) harness.send(ANA, pen([[index, 10], [index, 20]]));
    expect(harness.drawn()).toHaveLength(DRAW_BURST);
    expect(harness.refusals().every((reason) => reason === 'rate')).toBe(true);
    harness.send(BEN, pen([[10, 10], [20, 20]]));
    expect(harness.drawn()).toHaveLength(DRAW_BURST + 1);
    harness.now += 1000;
    harness.send(ANA, pen([[10, 10], [20, 20]]));
    expect(harness.drawn()).toHaveLength(DRAW_BURST + 2);
  });

  it('deals with a request once: one sent again changes nothing and is not answered again', () => {
    const harness = table();
    const request = pen([[10, 10], [20, 20]]);
    harness.send(ANA, request);
    harness.send(ANA, request);
    harness.send(ANA, { ...request, n: request.n - 1 });
    expect(harness.drawn()).toHaveLength(1);
    expect(harness.sent).toHaveLength(0);
    expect(harness.changes).toBe(1);
    expect(harness.drawings.mine(ANA, { drawings: [], texts: [] }).seen).toBe(request.n);
  });

  it('keeps each player within the drawings, points and texts one player may have, and leaves the others theirs', () => {
    const harness = table();
    runUntracked(harness.store, () => harness.store.setState((draft) => {
      for (let index = 0; index < MAX_PLAYER_DRAWINGS - 1; index += 1) draft.objects.drawings[`a${index}`] = { id: `a${index}`, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 5, y: 5 }], color: '#ffffff', width: 3, opacity: 1, by: ANA };
      for (let index = 0; index < MAX_PLAYER_TEXTS; index += 1) draft.objects.texts[`t${index}`] = { id: `t${index}`, kind: 'text', x: 50, y: 50, text: 'x', fontSize: 20, fontFamily: 'Arial', color: '#ffffff', by: ANA };
    }));
    harness.now += 60_000;
    harness.send(ANA, pen([[10, 10], [20, 20]]));
    harness.send(ANA, pen([[10, 10], [20, 20]]));
    harness.send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: 100, y: 100, text: 'One more', look: TEXT_LOOK });
    expect(harness.drawn().filter((drawing) => drawing.by === ANA)).toHaveLength(MAX_PLAYER_DRAWINGS);
    expect(harness.written()).toHaveLength(MAX_PLAYER_TEXTS);
    expect(harness.refusals()).toEqual(['full', 'full']);
    harness.send(BEN, pen([[10, 10], [20, 20]]));
    harness.send(BEN, { t: 'draw-text', scene: SCENE, n: next(), x: 100, y: 100, text: 'Mine', look: TEXT_LOOK });
    expect(harness.drawn().filter((drawing) => drawing.by === BEN)).toHaveLength(1);
    expect(harness.written().filter((text) => text.by === BEN)).toHaveLength(1);
  });

  it('counts the points of all of a player\'s drawings together', () => {
    const harness = table();
    const long = Array.from({ length: 1000 }, (_, index) => ({ x: index, y: 10 }));
    runUntracked(harness.store, () => harness.store.setState((draft) => {
      for (let index = 0; index < MAX_PLAYER_DRAWING_POINTS / 1000; index += 1) draft.objects.drawings[`a${index}`] = { id: `a${index}`, kind: 'drawing', timestamp: 1, type: 'pen', points: long, color: '#ffffff', width: 3, opacity: 1, by: ANA };
    }));
    harness.send(ANA, pen([[10, 10]]));
    expect(harness.refusals()).toEqual(['full']);
  });
});

describe('a text a player writes', () => {
  it('is written in the tool\'s own look and size, with the width its words wrap at and where its lines break', () => {
    const { send, written, history } = table();
    send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: 300, y: 200, text: 'The old mill\nby the river', wrap: 120, breaks: [8], look: { ...TEXT_LOOK, bold: true } });
    expect(written()).toEqual([expect.objectContaining({
      kind: 'text', by: ANA, x: 300, y: 200, text: 'The old mill\nby the river', fontSize: textHeight('l', CELL), fontFamily: 'Atlas Oxanium', color: '#086ddd',
      outline: true, align: 'left', bold: true, italic: false, rotation: 0, scale: 1, width: 120, breaks: [8], order: 1,
    })]);
    for (const field of ['hidden', 'layer', 'locked', 'group', 'backgroundColor']) expect(written()[0]).not.toHaveProperty(field);
    expect(steps(history)).toBe(1);
  });

  it('is refused off the map, and with a width no letter fits in or the map does not hold', () => {
    const { send, written, refusals } = table();
    send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: -500, y: 200, text: 'Far', look: TEXT_LOOK });
    send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: 300, y: 200, text: 'Thin', wrap: 2, look: TEXT_LOOK });
    send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: 300, y: 200, text: 'Wide', wrap: 50_000, look: TEXT_LOOK });
    expect(written()).toHaveLength(0);
    expect(refusals()).toEqual(['place', 'shape', 'shape']);
  });

  it('never reaches the GM with words the protocol does not take: controls, direction marks, nothing that shows, too many', () => {
    for (const text of ['Tav‮ern', 'a\u0007b', '   ', '', 'x'.repeat(501), 'ends in space ']) {
      expect(parsePlayerMessage({ t: 'draw-text', scene: SCENE, n: 1, x: 1, y: 1, text, look: TEXT_LOOK })).toBeNull();
    }
    expect(parsePlayerMessage({ t: 'draw-text', scene: SCENE, n: 1, x: 1, y: 1, text: 'Two\nlines', look: TEXT_LOOK })).not.toBeNull();
  });
});

describe('what a player changes, removes and erases', () => {
  /** A table where Ana and Ben each drew a line and wrote a text, and the GM drew a line, hid one of Ana's, laid one on the map and locked one. */
  function drawnTable(): Table & { readonly ana: ReturnType<Table['mine']>; readonly ben: ReturnType<Table['mine']> } {
    const harness = table();
    harness.send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: [100, 100, 300, 100], look: LOOK });
    harness.send(ANA, { t: 'draw-text', scene: SCENE, n: next(), x: 400, y: 400, text: 'Ana was here', look: TEXT_LOOK });
    harness.send(BEN, { t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: [100, 200, 300, 200], look: LOOK });
    harness.send(BEN, { t: 'draw-text', scene: SCENE, n: next(), x: 400, y: 600, text: 'Ben too', look: TEXT_LOOK });
    harness.store.getState().addDrawing({ type: 'line', points: [{ x: 100, y: 300 }, { x: 300, y: 300 }], color: '#ffffff', width: 4, opacity: 1 });
    for (const more of [{ hidden: true as const }, { layer: 'map' as const }, { locked: true as const }]) {
      harness.store.getState().addDrawing({ type: 'line', points: [{ x: 100, y: 500 }, { x: 300, y: 500 }], color: '#ffffff', width: 4, opacity: 1, by: ANA, ...more });
    }
    harness.history.getState().clear();
    harness.sent.length = 0;
    harness.now += 60_000;
    return Object.assign(harness, { ana: harness.mine(ANA), ben: harness.mine(BEN) });
  }

  it('tells each player only what they made, shown, above the tokens and not locked, by ids of their own', () => {
    const { ana, ben, store } = drawnTable();
    const { drawings, texts } = store.getState().objects;
    expect(Object.keys(ana.drawings)).toHaveLength(1);
    expect(drawings[Object.values(ana.drawings)[0]!]).toMatchObject({ by: ANA, points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] });
    expect(texts[Object.values(ana.texts)[0]!]).toMatchObject({ by: ANA, text: 'Ana was here' });
    expect(drawings[Object.values(ben.drawings)[0]!]).toMatchObject({ by: BEN });
    // An id is short, a player's own count, and says nothing of the scene's ids.
    for (const id of [...Object.keys(ana.drawings), ...Object.keys(ana.texts), ...Object.keys(ben.drawings)]) expect(id).toMatch(/^[0-9a-z]{1,2}$/);
  });

  it('moves, turns and scales a player\'s own as their handles would, in one undo step', () => {
    const harness = drawnTable();
    const [line] = Object.entries(harness.ana.drawings)[0]!;
    const [words] = Object.entries(harness.ana.texts)[0]!;
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line, words], map: [1, 0, 0, 1, 50, -20, 0] });
    expect(harness.store.getState().objects.drawings[harness.ana.drawings[line]!]?.points).toEqual([{ x: 150, y: 80 }, { x: 350, y: 80 }]);
    expect(harness.store.getState().objects.texts[harness.ana.texts[words]!]).toMatchObject({ x: 450, y: 380 });
    expect(steps(harness.history)).toBe(1);
    // Twice as large about the origin: the text grows, the line keeps its width.
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line, words], map: [2, 0, 0, 2, 0, 0, 0] });
    expect(harness.store.getState().objects.drawings[harness.ana.drawings[line]!]).toMatchObject({ points: [{ x: 300, y: 160 }, { x: 700, y: 160 }], width: strokeWidth('m', CELL) });
    expect(harness.store.getState().objects.texts[harness.ana.texts[words]!]).toMatchObject({ x: 900, y: 760, scale: 2 });
    harness.history.getState().undo();
    harness.history.getState().undo();
    expect(harness.store.getState().objects.drawings[harness.ana.drawings[line]!]?.points).toEqual([{ x: 100, y: 100 }, { x: 300, y: 100 }]);
  });

  it('refuses a move that leaves the map, and a text made larger than a player\'s may be', () => {
    const harness = drawnTable();
    const line = Object.keys(harness.ana.drawings)[0]!;
    const words = Object.keys(harness.ana.texts)[0]!;
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line], map: [1, 0, 0, 1, 5000, 0, 0] });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [words], map: [40, 0, 0, 40, -15600, -15600, 0] });
    expect(harness.refusals()).toEqual(['place', 'place']);
    expect(steps(harness.history)).toBe(0);
    expect(harness.store.getState().objects.texts[harness.ana.texts[words]!]).not.toHaveProperty('scale', 40);
  });

  it('gives a pick of the bars to a player\'s own, sized by the GM, and never who sees it or where it lies', () => {
    const harness = drawnTable();
    const line = Object.keys(harness.ana.drawings)[0]!;
    const words = Object.keys(harness.ana.texts)[0]!;
    const drawing = (): DrawingStroke => harness.store.getState().objects.drawings[harness.ana.drawings[line]!]!;
    const text = (): TextElement => harness.store.getState().objects.texts[harness.ana.texts[words]!]!;
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line, words], style: { colour: '#00ff00' } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line, words], style: { size: 'xl' } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line], style: { ends: 'end' } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [words], style: { look: 'plate' } });
    expect(drawing()).toMatchObject({ color: '#00ff00', width: strokeWidth('xl', CELL), ends: 'end' });
    expect(text()).toMatchObject({ color: '#00ff00', fontSize: textHeight('xl', CELL), backgroundColor: '#000000' });
    expect(text()).not.toHaveProperty('outline');
    expect(steps(harness.history)).toBe(4);
    // The protocol has no word for these, and the GM writes none of them from a pick.
    for (const style of [{ players: false }, { layer: 'map' }, { hidden: true }, { locked: true }, { icon: 'door' }, { width: 5000 }, { colour: '#00ff00', size: 'xl' }]) {
      expect(parsePlayerMessage({ t: 'draw-change', scene: SCENE, n: 1, ids: [line], style })).toBeNull();
    }
    for (const field of ['hidden', 'layer', 'locked', 'group']) expect(drawing()).not.toHaveProperty(field);
  });

  it('sets a line\'s points and a text\'s words anew', () => {
    const harness = drawnTable();
    const line = Object.keys(harness.ana.drawings)[0]!;
    const words = Object.keys(harness.ana.texts)[0]!;
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line], line: { pts: [100, 100, 200, 180, 300, 100] } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [words], words: { x: 410, y: 405, text: 'Ana was here, twice', wrap: 150, breaks: [8] } });
    expect(harness.store.getState().objects.drawings[harness.ana.drawings[line]!]?.points).toEqual([{ x: 100, y: 100 }, { x: 200, y: 180 }, { x: 300, y: 100 }]);
    expect(harness.store.getState().objects.texts[harness.ana.texts[words]!]).toMatchObject({ x: 410, y: 405, text: 'Ana was here, twice', width: 150, breaks: [8], by: ANA });
    expect(steps(harness.history)).toBe(2);
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [line], line: { pts: [100, 100, 9000, 100] } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [words], words: { x: 410, y: 405, wrap: 1 } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [words], words: { x: 410, y: 405, text: 'short', breaks: [40] } });
    expect(harness.refusals()).toEqual(['place', 'shape', 'shape']);
  });

  it('reaches nothing a player did not make: not by another\'s id, an id never told, or the scene\'s own', () => {
    const harness = drawnTable();
    const bens = Object.keys(harness.ben.drawings)[0]!;
    const before = JSON.stringify(harness.store.getState().objects);
    const sceneId = Object.keys(harness.store.getState().objects.drawings)[2]!;
    // Ben's id for his line is Ana's id for hers: an id is of use to its owner alone.
    expect(Object.keys(harness.ana.drawings)).toContain(bens);
    const anas = Object.values(harness.ana.drawings)[0]!;
    harness.send(BEN, { t: 'draw-remove', scene: SCENE, n: next(), ids: ['9'] });
    harness.send(BEN, { t: 'draw-change', scene: SCENE, n: next(), ids: ['zz'], style: { colour: '#000000' } });
    expect(parsePlayerMessage({ t: 'draw-remove', scene: SCENE, n: 1, ids: [sceneId] })).toBeNull();
    expect(JSON.stringify(harness.store.getState().objects)).toBe(before);
    expect(harness.refusals()).toEqual(['gone', 'gone']);
    // A request that names one thing that is not theirs changes none of what is.
    harness.send(BEN, { t: 'draw-change', scene: SCENE, n: next(), ids: [bens, '7'], map: [1, 0, 0, 1, 10, 10, 0] });
    expect(JSON.stringify(harness.store.getState().objects)).toBe(before);
    harness.send(BEN, { t: 'draw-remove', scene: SCENE, n: next(), ids: [bens] });
    expect(harness.store.getState().objects.drawings[anas]).toBeDefined();
    expect(harness.drawn().some((drawing) => drawing.by === BEN)).toBe(false);
  });

  it('tells no id for what the GM hid, laid on the map or locked, and takes no change of it', () => {
    const harness = drawnTable();
    const kept = harness.drawn().filter((drawing) => drawing.by === ANA && (drawing.hidden || drawing.layer === 'map' || drawing.locked));
    expect(kept).toHaveLength(3);
    const told = new Set(Object.values(harness.ana.drawings));
    for (const drawing of kept) expect(told.has(drawing.id)).toBe(false);
    // Every id Ana could name, as far as a page may count: none reaches them.
    for (let alias = 1; alias < 40; alias += 1) harness.send(ANA, { t: 'draw-remove', scene: SCENE, n: next(), ids: [alias.toString(36)] });
    expect(harness.drawn().filter((drawing) => drawing.by === ANA && (drawing.hidden || drawing.layer === 'map' || drawing.locked))).toHaveLength(3);
  });

  it('removes a player\'s own in one undo step', () => {
    const harness = drawnTable();
    harness.send(ANA, { t: 'draw-remove', scene: SCENE, n: next(), ids: [...Object.keys(harness.ana.drawings), ...Object.keys(harness.ana.texts)] });
    expect(harness.written().some((text) => text.by === ANA)).toBe(false);
    expect(steps(harness.history)).toBe(1);
    harness.history.getState().undo();
    expect(harness.written().some((text) => text.by === ANA)).toBe(true);
  });

  it('cuts with the eraser what the sweep reaches of the sender\'s own alone, by the GM\'s own rule, in one undo step', () => {
    const harness = drawnTable();
    const others = JSON.stringify(harness.drawn().filter((drawing) => drawing.by !== ANA || drawing.locked || drawing.hidden || drawing.layer === 'map'));
    // Straight down through Ana's line, Ben's line, the GM's line and Ana's hidden, on-map and locked ones.
    harness.send(ANA, { t: 'draw-erase', scene: SCENE, n: next(), pts: [200, 50, 200, 550], size: 'm' });
    // The eraser takes the ink it touches: the line ends half its width before the eraser's edge.
    const radius = eraserRadius('m', CELL) + strokeWidth('m', CELL) / 2;
    const pieces = harness.drawn().filter((drawing) => drawing.by === ANA && !drawing.locked && !drawing.hidden && drawing.layer !== 'map');
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.points[0]).toEqual({ x: 100, y: 100 });
    expect(pieces[0]?.points[1]?.x).toBeCloseTo(200 - radius, 9);
    expect(pieces[1]?.points[0]?.x).toBeCloseTo(200 + radius, 9);
    expect(pieces[1]?.points[1]).toEqual({ x: 300, y: 100 });
    // The pieces are still Ana's, and nothing else was touched.
    expect(pieces.every((piece) => piece.by === ANA && piece.color === '#e93147')).toBe(true);
    expect(JSON.stringify(harness.drawn().filter((drawing) => drawing.by !== ANA || drawing.locked || drawing.hidden || drawing.layer === 'map'))).toBe(others);
    expect(steps(harness.history)).toBe(1);
    harness.history.getState().undo();
    expect(harness.drawn().filter((drawing) => drawing.by === ANA && !drawing.locked && !drawing.hidden && drawing.layer !== 'map')).toHaveLength(1);
    // A sweep that reaches nothing of theirs is no step and no refusal; one off the map is refused.
    harness.send(BEN, { t: 'draw-erase', scene: SCENE, n: next(), pts: [1000, 1000], size: 'xl', whole: true });
    harness.send(BEN, { t: 'draw-erase', scene: SCENE, n: next(), pts: [90_000, 0], size: 's' });
    expect(steps(harness.history)).toBe(0);
    expect(harness.refusals()).toEqual(['place']);
  });

  it('removes with the eraser a text of the sender\'s it touches, and whole drawings where it is told to', () => {
    const harness = drawnTable();
    harness.send(BEN, { t: 'draw-erase', scene: SCENE, n: next(), pts: [400, 600, 200, 200], size: 'l', whole: true });
    expect(harness.written().map((text) => text.by)).toEqual([ANA]);
    expect(harness.drawn().some((drawing) => drawing.by === BEN)).toBe(false);
    expect(steps(harness.history)).toBe(1);
  });

  it('lets the GM clear one player\'s drawings and texts, locked and hidden ones too, in one undo step', () => {
    const harness = drawnTable();
    expect(drawnBy(harness.store.getState(), ANA)).toHaveLength(5);
    harness.store.getState().setSelection(drawnBy(harness.store.getState(), ANA));
    expect(clearDrawnBy(harness.store, ANA)).toBe(5);
    expect(harness.drawn().some((drawing) => drawing.by === ANA)).toBe(false);
    expect(harness.written().map((text) => text.by)).toEqual([BEN]);
    expect(harness.store.getState().selectedIds).toEqual([]);
    expect(steps(harness.history)).toBe(1);
    expect(clearDrawnBy(harness.store, ANA)).toBe(0);
    expect(steps(harness.history)).toBe(1);
    harness.history.getState().undo();
    expect(drawnBy(harness.store.getState(), ANA)).toHaveLength(5);
  });
});
