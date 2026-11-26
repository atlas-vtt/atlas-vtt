import { CURSOR_REST_MS, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceSet } from '../../../../src/app/types/diceSetTypes';
import type { NotePin, TokenEntity } from '../../../../src/app/types';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { MapLayerSource } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import { LASER_SILENCE_MS } from '../../../../src/app/online/gm/MarkShare.ts';
import { tableControlsStore } from '../../../../src/app/stores/tableControlsStore';
import { afterEach, describe, expect, it } from 'vitest';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import type { PlayerPage } from './playerPages.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const GRID = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 } as const;

/** A wall between Ana's room and Ben's, and a door at the far side of Ben's. */
const WALLS: Record<string, WallSegment> = {
  between: { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } } as WallSegment,
  door: { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 1000, y: 100 }, p2: { x: 1000, y: 300 } } as WallSegment,
};
const DEN: NotePin = { id: 'den', kind: 'pin', x: 950, y: 250, notePath: 'Notes/Den.md', readable: true } as NotePin;

/** A character's own dice: two d12, a d6 added with advantage and taken away with disadvantage. */
const HOPE: DiceSet = {
  id: 'hope', name: 'Hope and Fear', builtIn: false, crit: 'none',
  dice: [{ count: 1, sides: 12 }, { count: 1, sides: 12 }],
  advantage: { kind: 'die', sides: 6 }, disadvantage: { kind: 'die', sides: 6 },
};

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

/** A dark scene of two rooms: Ana with a rat in hers, Ben with a goblin in his, both seeing by darkvision, neither through the wall; `tokens` over them. */
function rooms(tokens: Record<string, Partial<TokenEntity>> = {}): SceneState {
  const all: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300 }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...all[id]!, ...change } as TokenEntity;
  const state = sceneState({ grid: GRID, lighting: { enabled: true, ambient: 0 } });
  return { ...state, objects: { ...state.objects, walls: WALLS, tokens: all, pins: { den: DEN } } };
}

/** Ana, Ben and Cara at the table; Ana and Ben own their tokens, Cara none. */
const seats: SeatSource = { onlinePlayers: () => [ANA, BEN, CARA], ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };

/** The party's map layers as the GM's renderer tells them: it sees the door. */
const partyLayers: MapLayerSource = { grid: () => null, rules: () => null, presets: () => [], doorsSeen: () => new Set(['door']), pointsSeen: (points) => points.map(() => true), sensed: () => [] };

/** A table of Ana, Ben and Cara on the two rooms, every page settled after the scene was shared. */
async function started(sharedVision: boolean, state = rooms()): Promise<ShareHarness> {
  const table = shareHarness(state, IMAGES, seats);
  table.pages.join(ANA, BEN, CARA);
  table.settings = { ...PLAYER_SETTINGS, sharedVision };
  table.layers = partyLayers;
  table.perception = gmPerception(state, GENERIC_SOURCE, MAP);
  table.share.start();
  await table.set(state);
  await table.advance(1000);
  return table;
}

const page = (table: ShareHarness, player: string): PlayerPage => table.pages.of(player);
const names = (shown: PlayerPage): string[] => shown.tokens.map((entry) => entry.name ?? '?').sort();
const everyone = [ANA, BEN, CARA];

afterEach(() => {
  tableControlsStore.setState({ paused: false, playMode: 'table' });
});

describe('each page follows what its player may see', () => {
  it('as a token moves: the pages whose picture shows it, and no other', async () => {
    const table = await started(false);
    const mark = table.pages.mark();
    await table.set(rooms({ goblin: { x: 950 } }));
    expect(page(table, BEN).tokens.find((entry) => entry.name === 'Goblin')).toMatchObject({ x: 950 });
    expect(table.pages.since(mark)[ANA] ?? []).toEqual([]);
    expect(JSON.stringify(page(table, ANA).inbox)).not.toContain('Goblin');
  });

  it('as the GM\'s sight changes without the store changing: tokens and doors leave every page that saw them', async () => {
    const table = await started(true);
    for (const player of everyone) expect(names(page(table, player))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
    const seen = table.perception;
    table.perception = (id) => (id === 'goblin' ? 'unseen' : seen?.(id) ?? 'seen');
    table.layers = { ...partyLayers, doorsSeen: () => new Set() };
    table.sightChanged();
    await table.settle();
    for (const player of everyone) {
      expect(names(page(table, player))).toEqual(['Ana', 'Ben', 'Rat']);
      expect(page(table, player).last('doors')?.doors).toEqual([]);
    }
  });

  it('as Shared vision is switched on and off: every page moves between the party\'s picture and its own', async () => {
    const table = await started(false);
    table.settings = { ...PLAYER_SETTINGS, sharedVision: true };
    await table.settle();
    expect(names(page(table, ANA))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
    expect(names(page(table, CARA))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
    table.settings = { ...PLAYER_SETTINGS, sharedVision: false };
    await table.settle();
    expect(names(page(table, ANA))).toEqual(['Ana', 'Rat']);
    expect(names(page(table, CARA))).toEqual([]);
  });

  it('as the table turns to remote mode and back: every page shows the party\'s picture, as the one screen does, then its own again', async () => {
    const table = await started(false);
    tableControlsStore.setState({ playMode: 'remote' });
    await table.settle();
    for (const player of everyone) expect(names(page(table, player))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
    tableControlsStore.setState({ playMode: 'table' });
    await table.settle();
    expect(names(page(table, BEN))).toEqual(['Ben', 'Goblin']);
  });

  it('as the GM pauses play: a player\'s move is refused at once, saying so', async () => {
    const table = await started(false);
    const listed = page(table, ANA).last('tokens');
    const ana = listed?.tokens.find((entry) => entry.name === 'Ana');
    tableControlsStore.setState({ paused: true });
    table.share.receive(ANA, { t: 'move', scene: listed?.scene ?? '', id: ana?.id ?? '', x: 260, y: 200 });
    expect(page(table, ANA).last('move-refused')).toMatchObject({ id: ana?.id, reason: 'paused' });
    expect(table.state().objects.tokens.ana).toMatchObject({ x: 200, y: 200 });
  });

  it('as the GM lets players draw, and no longer: every page\'s rules say so', async () => {
    const table = await started(false);
    for (const player of everyone) expect(page(table, player).last('rules')).not.toHaveProperty('draw');
    table.settings = { ...PLAYER_SETTINGS, playersDraw: true };
    await table.settle();
    for (const player of everyone) expect(page(table, player).last('rules')?.draw).toEqual({ cell: expect.any(Number) as number });
    table.settings = { ...PLAYER_SETTINGS, playersDraw: false };
    await table.settle();
    for (const player of everyone) expect(page(table, player).last('rules')).not.toHaveProperty('draw');
  });

  it('as a character\'s dice set changes: only its player\'s page is told the set', async () => {
    const table = await started(false);
    let set: DiceSet | undefined;
    table.dice = { viewId: 'view-1', rollDice: () => null, rules: () => DEFAULT_DICE_RULES, setFor: (entry) => (entry.id === 'ana' ? set : undefined), on: () => undefined, off: () => undefined };
    await table.advance(1000);
    const before = table.pages.mark();
    set = HOPE;
    // The character's template changed: Atlas's statblocks tell of it.
    table.atlasChanged();
    await table.settle();
    const told = table.pages.since(before, 'mine');
    expect(Object.keys(told)).toEqual([ANA]);
    expect(Object.values(told[ANA]?.at(-1)?.dice ?? {})).toEqual([{ dice: [{ count: 1, sides: 12 }, { count: 1, sides: 12 }], sides: ['advantage', 'disadvantage'] }]);
  });
});

describe('marks that change with time alone', () => {
  const lastMarks = (shown: PlayerPage): Extract<GmMessage, { t: 'marks' }> | undefined => shown.last('marks');

  it('leave every page once a player\'s laser falls silent', async () => {
    const table = await started(true);
    const scene = page(table, ANA).last('tokens')?.scene ?? '';
    table.share.receive(ANA, { t: 'laser', scene, color: '#66ffa9', size: 16, at: [200, 200], pts: [200, 200, 210, 200], on: true });
    await table.advance(200);
    expect(lastMarks(page(table, BEN))?.lasers.map(({ who }) => who)).toEqual([ANA]);
    await table.advance(LASER_SILENCE_MS + 1000);
    expect(lastMarks(page(table, BEN))?.lasers).toEqual([]);
  });

  it('leave every page once a player\'s cursor comes to rest', async () => {
    const table = await started(true);
    table.settings = { ...PLAYER_SETTINGS, sharedVision: true, showCursors: true };
    await table.advance(1000);
    const scene = page(table, ANA).last('tokens')?.scene ?? '';
    table.share.receive(ANA, { t: 'cursor', scene, at: [400, 400], pts: [400, 400] });
    await table.advance(200);
    expect(lastMarks(page(table, BEN))?.cursors?.map(({ who }) => who)).toEqual([ANA]);
    await table.advance(CURSOR_REST_MS + 1000);
    expect(lastMarks(page(table, BEN))?.cursors).toEqual([]);
  });
});
