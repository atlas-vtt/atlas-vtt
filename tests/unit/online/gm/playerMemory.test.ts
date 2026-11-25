import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { describe, expect, it } from 'vitest';
import { EXPLORED_INTERVAL_MS } from '../../../../src/app/online/gm/ExploredShare.ts';
import { MEMORY_STORE_MS } from '../../../../src/app/online/gm/memory/FloorMemories.ts';
import { KeptMemories } from '../../../../src/app/online/gm/memory/KeptMemories.ts';
import { PlayerMemoryEdits } from '../../../../src/app/online/gm/memory/PlayerMemoryEdits.ts';
import type { Point } from '../../../../src/app/types/visionTypes';
import { pngOf } from './fakeTileCache.ts';
import { FAKE_IMAGES, fakeFiles, FakeMemoryStore, fakeMask, fakeMemory, fakePng, rememberedCells } from './fakeMemory.ts';
import { PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState, sequenced, shareHarness, token, type Sent, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const DAN = 'd'.repeat(20);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.png', pngOf(MAP.width, MAP.height)]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const FLOOR = { mapPath: 'Scenes/Cave.atlasmap', level: null };

/** Three rooms side by side, walled off from each other: west of x 500, between 500 and 1000, east of 1000. */
const WALLS: Record<string, WallSegment> = {
  west: { id: 'west', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 3000 } } as WallSegment,
  east: { id: 'east', kind: 'wall', type: 'solid', p1: { x: 1000, y: 0 }, p2: { x: 1000, y: 3000 } } as WallSegment,
};

const westRoom = (x: number): boolean => x < 500;
const middleRoom = (x: number): boolean => x > 500 && x < 1000;

/** A dark scene of the three rooms: Ana in the west one, Ben in the middle one, both seeing by darkvision; `tokens` over them. */
function rooms(tokens: Record<string, Partial<TokenEntity>> = {}, changes: Partial<SceneState> = {}): SceneState {
  const all: Record<string, TokenEntity> = {
    ana: { ...token('ana', { x: 250, y: 250, vision: DARKVISION }), kind: 'character', name: 'Ana' } as TokenEntity,
    ben: { ...token('ben', { x: 750, y: 250, vision: DARKVISION }), kind: 'character', name: 'Ben' } as TokenEntity,
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...all[id]!, ...change } as TokenEntity;
  const state = sceneState({ background: 'maps/cave.png', lighting: { enabled: true, ambient: 0 }, ...changes });
  return { ...state, objects: { ...state.objects, walls: WALLS, tokens: all } };
}

/** Ana, Ben and Cara at the table; Ana and Ben own their tokens, Cara none. */
const seats: SeatSource = { onlinePlayers: () => [ANA, BEN, CARA], ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };

/** The party's memory as the GM saved it: all three rooms. */
const PARTY_MASK = fakeMask(MAP, () => true);

/** The GM's edits by hand of the floor, reaching every player's memory in `store`, held by a running table where it holds them. */
const editsOf = (store: FakeMemoryStore): { readonly kept: KeptMemories; readonly edits: PlayerMemoryEdits } => {
  const kept = new KeptMemories(fakeFiles(store), FAKE_IMAGES);
  return { kept, edits: new PlayerMemoryEdits(kept, () => FLOOR) };
};

/** A rectangle of the map, as the GM erases one by hand. */
const area = (x: number, width: number): { readonly shapes: { readonly polygons: Point[][]; readonly clip: null }; readonly bounds: typeof MAP } => ({
  shapes: { polygons: [[{ x, y: 0 }, { x: x + width, y: 0 }, { x: x + width, y: MAP.height }, { x, y: MAP.height }]], clip: null }, bounds: MAP,
});

async function started(state: SceneState, store: FakeMemoryStore, sharedVision = false, kept?: KeptMemories): Promise<ShareHarness> {
  const table = shareHarness(state, IMAGES, seats, undefined, undefined, fakeMemory(store, kept));
  table.settings = { ...PLAYER_SETTINGS, sharedVision };
  table.share.start();
  await table.set(state);
  await table.advance(2 * EXPLORED_INTERVAL_MS + 100);
  return table;
}

type Explored = Extract<GmMessage, { t: 'explored' }>;

/** The explored messages one player got, in order: to them, and to all. */
const exploredTo = (sent: readonly Sent[], player: string): Explored[] =>
  sent.flatMap(({ body, to }) => (body.t === 'explored' && (to === player || to === undefined) ? [body] : []));

/** The middles of the cells an explored message's memory remembers. */
const cells = (message: Explored | undefined): { readonly x: number; readonly y: number }[] =>
  rememberedCells(MAP, message?.png === undefined ? null : Uint8Array.from(Buffer.from(message.png, 'base64')));

describe('each player\'s own explored memory, with Shared vision off', () => {
  it('holds only what that player\'s own character saw, never what only another player\'s did nor the party\'s', async () => {
    const table = await started(rooms({}, { exploredMask: PARTY_MASK }), new FakeMemoryStore());
    const ana = exploredTo(table.sent, ANA);
    const ben = exploredTo(table.sent, BEN);
    expect(cells(ana.at(-1)).length).toBeGreaterThan(0);
    expect(cells(ana.at(-1)).every(({ x }) => westRoom(x))).toBe(true);
    expect(cells(ben.at(-1)).every(({ x }) => middleRoom(x))).toBe(true);
    expect(ana.flatMap(cells).some(({ x }) => !westRoom(x))).toBe(false);
    const party = PARTY_MASK.slice('data:image/png;base64,'.length);
    expect([...ana, ...ben].some((message) => message.png === party)).toBe(false);
  });

  it('starts empty on a floor the player never explored, under a count of removals that makes their page replace what it held', async () => {
    const table = await started(rooms({}, { exploredMask: PARTY_MASK }), new FakeMemoryStore());
    const first = exploredTo(table.sent, ANA)[0];
    expect(first?.png).toBeUndefined();
    expect(first?.serial).toBeGreaterThan(0);
  });

  it('sends a player without a seeing character of their own no memory but their own, and their page is blind', async () => {
    const table = await started(rooms({}, { exploredMask: PARTY_MASK }), new FakeMemoryStore());
    const cara = exploredTo(table.sent, CARA);
    expect(cara.length).toBeGreaterThan(0);
    expect(cara.every((message) => message.png === undefined && message.mask === undefined)).toBe(true);
    const toCara = table.sent.filter(({ to }) => to === CARA || to === undefined);
    expect(sequenced(toCara, 'sight').at(-1)?.blind).toBe(true);
  });

  it('is kept in the campaign, with what was seen since the last write when the share stops, and given back when it starts again', async () => {
    const store = new FakeMemoryStore();
    const first = await started(rooms(), store);
    // Ana walks into the middle room, sooner than the next write would come.
    await first.set(rooms({ ana: { x: 750, y: 600 } }));
    await first.advance(2 * EXPLORED_INTERVAL_MS);
    first.share.stop();
    await first.settle();
    const kept = rememberedCells(MAP, store.files.get(FakeMemoryStore.key(FLOOR, ANA)) ?? null);
    expect(kept.some(({ x }) => middleRoom(x))).toBe(true);
    // Next session: Ana stands in the east room, and remembers the two she saw.
    const second = await started(rooms({ ana: { x: 1500, y: 250 } }), store);
    const remembered = cells(exploredTo(second.sent, ANA).at(-1));
    expect(remembered.some(({ x }) => westRoom(x))).toBe(true);
    expect(remembered.some(({ x }) => middleRoom(x))).toBe(true);
    expect(remembered.some(({ x }) => x > 1000)).toBe(true);
  });

  it('is written only when it changed, and at most every so often', async () => {
    const store = new FakeMemoryStore();
    const table = await started(rooms(), store);
    await table.advance(MEMORY_STORE_MS + 100);
    const written = store.writes;
    expect(written).toBeGreaterThan(0);
    await table.advance(3 * MEMORY_STORE_MS);
    expect(store.writes).toBe(written);
  });

  it('loses everything when the GM forgets the explored areas, of every floor, kept in the campaign too for a player who is away', async () => {
    const store = new FakeMemoryStore();
    const cellar = { ...FLOOR, level: 'cellar' };
    store.files.set(FakeMemoryStore.key(FLOOR, DAN), fakePng(new Uint8Array(30 * 30).fill(255)));
    store.files.set(FakeMemoryStore.key(cellar, ANA), fakePng(new Uint8Array(30 * 30).fill(255)));
    const { kept, edits } = editsOf(store);
    const table = await started(rooms({}, { exploredMask: PARTY_MASK }), store, false, kept);
    // Ana walks over to the middle room: she remembers both rooms.
    await table.set(rooms({ ana: { x: 750, y: 600 } }, { exploredMask: PARTY_MASK }));
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    expect(cells(exploredTo(table.sent, ANA).at(-1)).some(({ x }) => westRoom(x))).toBe(true);
    // Forget explored areas: the edit by hand of the floor shown, every floor, then the save of the memory it left, none.
    edits.edited(1, area(0, MAP.width));
    edits.forgot(1);
    await table.set({ ...table.state(), exploredEdits: 1 });
    await table.set({ ...table.state(), exploredMask: fakeMask(MAP, () => false) });
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    expect([...store.files.keys()].filter((key) => key !== FakeMemoryStore.key(FLOOR, ANA) && key !== FakeMemoryStore.key(FLOOR, BEN))).toEqual([]);
    expect(rememberedCells(MAP, store.files.get(FakeMemoryStore.key(FLOOR, ANA)) ?? null).some(({ x }) => westRoom(x))).toBe(false);
    const ana = exploredTo(table.sent, ANA);
    expect(cells(ana.at(-1)).some(({ x }) => westRoom(x))).toBe(false);
    expect(ana.at(-1)?.serial).not.toBe(ana.at(-3)?.serial);
  });

  it('loses what the GM erased by hand, also where the party never explored, and keeps the rest', async () => {
    const store = new FakeMemoryStore();
    const { kept, edits } = editsOf(store);
    // The party remembers only the middle room: the GM's view never saw the west room explored.
    const table = await started(rooms({}, { exploredMask: fakeMask(MAP, middleRoom) }), store, false, kept);
    await table.set(rooms({ ana: { x: 750, y: 600 } }, { exploredMask: fakeMask(MAP, middleRoom) }));
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    expect(cells(exploredTo(table.sent, ANA).at(-1)).some(({ x }) => westRoom(x))).toBe(true);
    // The GM erases the west room by hand.
    edits.edited(1, area(0, 500));
    await table.set({ ...table.state(), exploredEdits: 1 });
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    const remembered = cells(exploredTo(table.sent, ANA).at(-1));
    expect(remembered.some(({ x }) => westRoom(x))).toBe(false);
    expect(remembered.some(({ x }) => middleRoom(x))).toBe(true);
  });

  it('gets back what the GM erased when the erase is undone, and loses it again when it is redone', async () => {
    const store = new FakeMemoryStore();
    store.files.set(FakeMemoryStore.key(FLOOR, DAN), fakePng(new Uint8Array(30 * 30).fill(255)));
    const { kept, edits } = editsOf(store);
    const table = await started(rooms({}, { exploredMask: PARTY_MASK }), store, false, kept);
    const dan = (): { readonly x: number; readonly y: number }[] => rememberedCells(MAP, store.files.get(FakeMemoryStore.key(FLOOR, DAN)) ?? null);
    // Ana walks over to the middle room, out of sight of the west room she remembers.
    await table.set(rooms({ ana: { x: 750, y: 600 } }, { exploredMask: PARTY_MASK }));
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    edits.edited(1, area(0, 500));
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    expect(dan().some(({ x }) => westRoom(x))).toBe(false);
    expect(cells(exploredTo(table.sent, ANA).at(-1)).some(({ x }) => westRoom(x))).toBe(false);
    edits.travel(1, 0);
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    expect(dan()).toHaveLength(30 * 30);
    expect(cells(exploredTo(table.sent, ANA).at(-1)).some(({ x }) => westRoom(x))).toBe(true);
    edits.travel(0, 1);
    await table.advance(2 * EXPLORED_INTERVAL_MS);
    expect(dan().some(({ x }) => westRoom(x))).toBe(false);
  });
});

describe('explored memory with Shared vision on', () => {
  it('is the party\'s for every player, in one message to all, as before', async () => {
    const table = await started(rooms({}, { exploredMask: PARTY_MASK }), new FakeMemoryStore(), true);
    const party = PARTY_MASK.slice('data:image/png;base64,'.length);
    const explored = table.sent.filter(({ body }) => body.t === 'explored');
    expect(explored.map(({ to }) => to)).toEqual([undefined]);
    expect(explored.every(({ body }) => body.t === 'explored' && body.png === party && body.serial === 0)).toBe(true);
  });

  it('leaves each player what the party\'s picture showed them once it is switched off, kept in the campaign', async () => {
    const store = new FakeMemoryStore();
    const table = await started(rooms(), store, true);
    table.settings = { ...PLAYER_SETTINGS, sharedVision: false };
    await table.advance(2 * EXPLORED_INTERVAL_MS + 100);
    // Ana's own eyes never saw Ben's room; the party's picture she was shown did.
    const ana = cells(exploredTo(table.sent, ANA).at(-1));
    expect(ana.some(({ x }) => westRoom(x))).toBe(true);
    expect(ana.some(({ x }) => middleRoom(x))).toBe(true);
    expect(cells(exploredTo(table.sent, CARA).at(-1)).some(({ x }) => middleRoom(x))).toBe(true);
    table.share.stop();
    await table.settle();
    expect(rememberedCells(MAP, store.files.get(FakeMemoryStore.key(FLOOR, ANA)) ?? null).some(({ x }) => middleRoom(x))).toBe(true);
  });
});
