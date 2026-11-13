import { describe, expect, it } from 'vitest';
import { strokeWidth } from '../../../../src/app/annotations/drawSizes';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { STROKE_KEPT_MS } from '../../../../src/app/online/gm/gmStrokes.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import { TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { GM_LEVEL, MARKS_INTERVAL_MS, parseGmMessage, PLAYERS_DRAW_GM_LEVEL, type DrawLook, type DrawMine, type GmMessage, type MarksMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DrawingStroke } from '../../../../src/app/types';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE, PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CELL = 70;
const LOOK: DrawLook = { colour: '#e93147', size: 'm' };
const GRID = { enabled: true, size: CELL, offsetX: 0, offsetY: 0, opacity: 1 } as SceneState['grid'];
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ['maps/upper.webp', new Uint8Array([7, 7, 7])]]);
const DRAWING = { ...PLAYER_SETTINGS, playersDraw: true };

const ofKind = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): (Sent & { body: Extract<GmMessage, { t: T }> })[] =>
  sent.filter((entry): entry is Sent & { body: Extract<GmMessage, { t: T }> } => entry.body.t === t);
const sceneId = (table: ShareHarness): string => ofKind(table.sent, 'scene').at(-1)?.body.scene?.id ?? '';
const mineOf = (table: ShareHarness, player: string): DrawMine | undefined => ofKind(table.sent, 'draw-mine').filter(({ to }) => to === player).at(-1)?.body;
const lastMarks = (table: ShareHarness): MarksMessage | undefined => ofKind(table.sent, 'marks').at(-1)?.body;
const drawn = (table: ShareHarness): DrawingStroke[] => Object.values(table.state().objects.drawings);

function seats(online: readonly string[] = [ANA, BEN]): SeatSource {
  return { onlinePlayers: () => online, ownerOf: () => undefined, claimOf: () => null };
}

/** A table whose shared scene has a grid and nothing drawn; players may draw where `settings` say so. */
async function started(settings = DRAWING, state = sceneState({ grid: GRID }), seated = seats()): Promise<ShareHarness> {
  const table = shareHarness(state, IMAGES, seated);
  table.settings = settings;
  table.layers = fakeLayers({ state: () => table.state(), source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, grid: () => null, collections: null });
  table.share.start();
  await table.set(state);
  await table.advance(TOKEN_POLL_MS);
  return table;
}

let requests = 0;
const next = (): number => (requests += 1);

async function draws(table: ShareHarness, from: string, points: number[], more: Partial<{ scene: string; look: DrawLook }> = {}): Promise<number> {
  const n = next();
  table.share.receive(from, { t: 'draw-add', scene: more.scene ?? sceneId(table), n, mode: 'pen', pts: points, look: more.look ?? LOOK });
  await table.advance(MAP_LAYER_INTERVAL_MS);
  return n;
}

describe('whether players may draw', () => {
  it('is said by a GM of the level that takes their drawings', () => {
    expect(GM_LEVEL).toBeGreaterThanOrEqual(PLAYERS_DRAW_GM_LEVEL);
  });

  it('is off until the GM says so: the rules name no drawing, nobody is told what is theirs, and every request is refused', async () => {
    const table = await started(PLAYER_SETTINGS);
    expect(ofKind(table.sent, 'rules').at(-1)?.body).not.toHaveProperty('draw');
    const n = await draws(table, ANA, [100, 100, 200, 200]);
    table.share.receive(ANA, { t: 'stroke', scene: sceneId(table), n: next(), mode: 'pen', pts: [1, 1, 2, 2], from: 0, look: LOOK });
    await table.advance(MARKS_INTERVAL_MS * 2);
    expect(drawn(table)).toHaveLength(0);
    expect(ofKind(table.sent, 'draw-refused')).toEqual([{ body: { t: 'draw-refused', scene: sceneId(table), n, reason: 'off' }, to: ANA }]);
    expect(ofKind(table.sent, 'draw-mine')).toHaveLength(0);
    expect(ofKind(table.sent, 'marks').some(({ body }) => (body.strokes?.length ?? 0) > 0)).toBe(false);
  });

  it('follows the GM\'s switch while the table runs: the rules name the cell sizes are shares of, and stop naming it', async () => {
    const table = await started(PLAYER_SETTINGS);
    table.settings = DRAWING;
    await table.advance(TOKEN_POLL_MS);
    expect(ofKind(table.sent, 'rules').at(-1)?.body.draw).toEqual({ cell: CELL });
    expect(mineOf(table, ANA)).toMatchObject({ drawings: [], texts: [], seen: 0 });
    await draws(table, ANA, [100, 100, 200, 200]);
    expect(drawn(table)).toHaveLength(1);

    table.settings = PLAYER_SETTINGS;
    // Refused at once, whatever the page was last told.
    await draws(table, ANA, [100, 100, 200, 200]);
    expect(drawn(table)).toHaveLength(1);
    expect(ofKind(table.sent, 'draw-refused').at(-1)?.body.reason).toBe('off');
    await table.advance(TOKEN_POLL_MS);
    expect(ofKind(table.sent, 'rules').at(-1)?.body).not.toHaveProperty('draw');
    // What was drawn stays on the map: it is the scene's.
    expect(drawn(table)[0]?.by).toBe(ANA);
    for (const { body } of table.sent) expect(parseGmMessage(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });
});

describe('what each player is told is theirs', () => {
  it('follows the drawings it speaks of, by their number, and names a player\'s own to that player alone', async () => {
    const table = await started();
    const n = await draws(table, ANA, [100, 100, 200, 200]);
    await draws(table, BEN, [300, 300, 400, 400], { look: { colour: '#086ddd', size: 's' } });
    const annotations = ofKind(table.sent, 'annotations').at(-1)!;
    expect(annotations.body.drawings.map((drawing) => drawing.colour)).toEqual(['#e93147', '#086ddd']);
    expect(annotations.body.drawings[1]?.width).toBe(strokeWidth('s', CELL));
    const ana = mineOf(table, ANA)!;
    const ben = mineOf(table, BEN)!;
    expect(ana).toEqual({ t: 'draw-mine', scene: sceneId(table), rev: annotations.body.rev, drawings: [{ at: 0, id: '1' }], texts: [], seen: n });
    expect(ben).toMatchObject({ rev: annotations.body.rev, drawings: [{ at: 1, id: '1' }] });
    // Each is told after the drawings their places count in, and to nobody else.
    const order = table.sent.map(({ body }) => body.t);
    expect(order.lastIndexOf('draw-mine')).toBeGreaterThan(order.lastIndexOf('annotations'));
    expect(ofKind(table.sent, 'draw-mine').every(({ to }) => to === ANA || to === BEN)).toBe(true);
    // The drawings themselves say nothing of who made them.
    expect(JSON.stringify(annotations.body)).not.toContain(ANA);
    expect(JSON.stringify(annotations.body)).not.toMatch(/"by"|"id"/);
  });

  it('tells a player who joins what is theirs with the drawings, and everyone again when the GM draws', async () => {
    const table = await started();
    await draws(table, ANA, [100, 100, 200, 200]);
    table.sent.length = 0;
    table.share.resend(ANA);
    const kinds = table.sent.filter(({ to }) => to === ANA).map(({ body }) => body.t);
    expect(kinds.indexOf('draw-mine')).toBeGreaterThan(kinds.indexOf('annotations'));
    expect(ofKind(table.sent, 'draw-mine').map(({ to }) => to)).toEqual([ANA]);

    const before = mineOf(table, ANA)!.rev;
    const gms: DrawingStroke = { id: 'gm', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 5, y: 5 }, { x: 9, y: 9 }], color: '#ffffff', width: 3, opacity: 1, order: -5 };
    await table.set({ ...table.state(), objects: { ...table.state().objects, drawings: { ...table.state().objects.drawings, gm: gms } } });
    await table.advance(MAP_LAYER_INTERVAL_MS);
    // The GM's lies under Ana's: hers is the second entry now, and she is told so for the new message.
    expect(mineOf(table, ANA)).toMatchObject({ rev: before + 1, drawings: [{ at: 1, id: '1' }] });
    expect(mineOf(table, BEN)).toMatchObject({ rev: before + 1, drawings: [] });
  });

  it('names nothing the GM hid, locked or laid on the map, and nothing fog covers whole', async () => {
    const fog: Record<string, FogOperation> = { cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 1000, y: 1000, width: 600, height: 600 } };
    const state = sceneState({ grid: GRID });
    const table = await started(DRAWING, { ...state, objects: { ...state.objects, fog } });
    await draws(table, ANA, [100, 100, 200, 200]);
    await draws(table, ANA, [1200, 1200, 1300, 1300]);
    await draws(table, ANA, [300, 100, 400, 200]);
    // The one under the fog is not told, so it has no place and no id.
    expect(ofKind(table.sent, 'annotations').at(-1)?.body.drawings).toHaveLength(2);
    expect(mineOf(table, ANA)?.drawings).toEqual([{ at: 0, id: '1' }, { at: 1, id: '2' }]);
    const [first, , third] = drawn(table);
    for (const change of [{ hidden: true as const }, { locked: true as const }, { layer: 'map' as const }]) {
      const drawings = { ...table.state().objects.drawings, [first!.id]: { ...first!, ...change } };
      await table.set({ ...table.state(), objects: { ...table.state().objects, drawings } });
      await table.advance(MAP_LAYER_INTERVAL_MS);
      const mine = mineOf(table, ANA)!;
      expect(mine.drawings.map(({ id }) => id)).toEqual(['2']);
      // The id she had for it reaches it no more.
      table.share.receive(ANA, { t: 'draw-remove', scene: sceneId(table), n: next(), ids: ['1'] });
      expect(table.state().objects.drawings[first!.id]).toBeDefined();
      expect(ofKind(table.sent, 'draw-refused').at(-1)?.body.reason).toBe('gone');
    }
    expect(table.state().objects.drawings[third!.id]?.by).toBe(ANA);
  });
});

describe('the drawing a player is making', () => {
  it('is told to everyone as it grows, as the GM\'s own is, and for a moment that it was made', async () => {
    const table = await started();
    const scene = sceneId(table);
    const n = next();
    table.share.receive(ANA, { t: 'stroke', scene, n, mode: 'pen', pts: [100, 100, 110, 104], from: 0, look: LOOK });
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toEqual([{ who: ANA, n: 1, drawings: [{ type: 'pen', points: [100, 100, 110, 104], colour: '#e93147', width: strokeWidth('m', CELL), opacity: 1 }], from: 0 }]);
    table.share.receive(ANA, { t: 'stroke', scene, n, mode: 'pen', pts: [110, 104, 120, 110, 130, 118], from: 1, span: 100, look: LOOK });
    await table.advance(MARKS_INTERVAL_MS);
    // Each message tells the points since the one before the last: one that never arrives leaves no gap.
    expect(lastMarks(table)?.strokes?.[0]).toMatchObject({ who: ANA, n: 1, from: 0, drawings: [{ points: [100, 100, 110, 104, 120, 110, 130, 118] }] });
    // Presence alone: nothing of it is in the scene.
    expect(drawn(table)).toHaveLength(0);

    table.share.receive(ANA, { t: 'draw-add', scene, n, mode: 'pen', pts: [100, 100, 130, 118], look: LOOK });
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toEqual([{ who: ANA, n: 1, drawings: [], kept: true }]);
    await table.advance(STROKE_KEPT_MS + MARKS_INTERVAL_MS);
    table.share.receive(BEN, { t: 'stroke', scene, n: next(), mode: 'rectangle', pts: [0, 0, 70, 35], look: { ...LOOK, fill: 'soft' } });
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toEqual([{ who: BEN, n: 1, drawings: [expect.objectContaining({ shape: 'rectangle', fill: 'soft', points: [0, 0, 70, 0, 70, 35, 0, 35, 0, 0] })] }]);
    for (const { body } of ofKind(table.sent, 'marks')) expect(parseGmMessage(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });

  it('goes when its maker drops it, leaves, or the request that would make it is refused', async () => {
    const table = await started();
    const scene = sceneId(table);
    const stroke = (from: string, n: number): void => table.share.receive(from, { t: 'stroke', scene, n, mode: 'line', pts: [0, 0, 50, 50], look: LOOK });
    stroke(ANA, next());
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toHaveLength(1);
    table.share.receive(ANA, { t: 'stroke', scene, n: next(), mode: null, pts: [] });
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toBeUndefined();

    stroke(BEN, next());
    await table.advance(MARKS_INTERVAL_MS);
    table.share.playerLeft(BEN);
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toBeUndefined();

    const n = next();
    stroke(ANA, n);
    await table.advance(MARKS_INTERVAL_MS);
    // The drawing itself is none (a line of one point): it is refused, and its stroke is not held as one that was made.
    table.share.receive(ANA, { t: 'draw-add', scene, n, mode: 'line', pts: [5, 5], look: LOOK });
    expect(ofKind(table.sent, 'draw-refused').at(-1)?.body).toMatchObject({ n, reason: 'shape' });
    await table.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(table)?.strokes).toBeUndefined();
  });

  it('is told to nobody where committed fog covers it whole, or where it would not be taken', async () => {
    const fog: Record<string, FogOperation> = { cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 1000, y: 1000, width: 600, height: 600 } };
    const state = sceneState({ grid: GRID });
    const table = await started(DRAWING, { ...state, objects: { ...state.objects, fog } });
    table.share.receive(ANA, { t: 'stroke', scene: sceneId(table), n: next(), mode: 'pen', pts: [1200, 1200, 1250, 1260], from: 0, look: LOOK });
    table.share.receive(BEN, { t: 'stroke', scene: 'another-scene', n: next(), mode: 'pen', pts: [10, 10, 20, 20], from: 0, look: LOOK });
    table.share.receive('c'.repeat(20), { t: 'stroke', scene: sceneId(table), n: next(), mode: 'pen', pts: [10, 10, 20, 20], from: 0, look: LOOK });
    await table.advance(MARKS_INTERVAL_MS * 2);
    expect(ofKind(table.sent, 'marks').some(({ body }) => (body.strokes?.length ?? 0) > 0)).toBe(false);
  });
});

describe('a player on another floor than the GM looks at', () => {
  const LEVELS: SceneLevel[] = [
    { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/cave.webp' },
    { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
  ];

  it('draws on the floor they see: the drawing is that level\'s, and a request that names another floor is refused', async () => {
    const base = sceneState({ grid: GRID, levels: LEVELS, viewedLevel: 'ground' });
    const tokens = { ana: token('ana', { x: 100, y: 100 }), ben: token('ben', { x: 100, y: 100, level: 'upper' }) };
    const owners: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
    const seated: SeatSource = { onlinePlayers: () => [ANA, BEN], ownerOf: (id) => owners[id], claimOf: (_map, id) => (owners[id] === undefined ? null : 'taken') };
    const table = shareHarness({ ...base, objects: { ...base.objects, tokens } }, IMAGES, seated);
    table.settings = DRAWING;
    table.presented = 'ground';
    table.layers = fakeLayers({ state: () => table.state(), source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, grid: () => null, collections: null });
    table.share.start();
    await table.set(table.state());
    await table.advance(TOKEN_POLL_MS);
    const scenes = ofKind(table.sent, 'scene');
    const ground = scenes.filter(({ to }) => to === ANA || to === undefined).at(-1)?.body.scene?.id ?? '';
    const upper = scenes.filter(({ to }) => to === BEN).at(-1)?.body.scene?.id ?? '';
    expect(upper).not.toBe('');
    expect(upper).not.toBe(ground);

    table.share.receive(BEN, { t: 'draw-add', scene: upper, n: next(), mode: 'pen', pts: [10, 10, 20, 20], look: LOOK });
    table.share.receive(ANA, { t: 'draw-add', scene: upper, n: next(), mode: 'pen', pts: [30, 30, 40, 40], look: LOOK });
    table.share.receive(BEN, { t: 'draw-add', scene: ground, n: next(), mode: 'pen', pts: [50, 50, 60, 60], look: LOOK });
    await table.advance(MAP_LAYER_INTERVAL_MS);
    expect(drawn(table)).toEqual([expect.objectContaining({ by: BEN, level: 'upper', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] })]);
    expect(ofKind(table.sent, 'draw-refused').map(({ body, to }) => [to, body.reason])).toEqual([[ANA, 'scene'], [BEN, 'scene']]);
    // Ben is told his own on his floor's message; Ana's floor has none of it.
    expect(ofKind(table.sent, 'draw-mine').filter(({ to }) => to === BEN).at(-1)?.body).toMatchObject({ scene: upper, drawings: [{ at: 0, id: '1' }] });
    const anas = ofKind(table.sent, 'annotations').filter(({ body }) => body.scene === ground).at(-1);
    expect(anas?.body.drawings).toEqual([]);
  });
});
