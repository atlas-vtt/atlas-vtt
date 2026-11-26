import { EventEmitter } from 'node:events';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import type { NotePin, TokenEntity } from '../../../../src/app/types';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { MapLayerSource } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import type { DiceSource } from '../../../../src/app/online/gm/atlasDice.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { pictureBasisOf } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import { tableControlsStore } from '../../../../src/app/stores/tableControlsStore';
import { fakeAtlasTab } from './fakeAtlasTab.ts';
import { FakeLaser } from './markHarness.ts';
import type { Measurements } from '../../../../src/app/pixi/measure/measurements';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import { toAll, type PlayerPage } from './playerPages.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };

/** A wall between Ana's room and Ben's, and a door at the far side of Ben's. */
const WALLS: Record<string, WallSegment> = {
  between: { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } } as WallSegment,
  door: { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 1000, y: 100 }, p2: { x: 1000, y: 300 } } as WallSegment,
};

/** A readable pin in Ben's room, beside the goblin. */
const DEN: NotePin = { id: 'den', kind: 'pin', x: 950, y: 250, notePath: 'Notes/Den.md', readable: true } as NotePin;

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

/**
 * A dark scene of two rooms: Ana with a rat in hers, Ben with a goblin in his, both seeing by darkvision
 * (six cells), neither through the wall; `tokens` over them.
 */
function rooms(tokens: Record<string, Partial<TokenEntity>> = {}): SceneState {
  const all: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300 }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...all[id]!, ...change } as TokenEntity;
  const state = sceneState({ lighting: { enabled: true, ambient: 0 } });
  return { ...state, objects: { ...state.objects, walls: WALLS, tokens: all, pins: { den: DEN } } };
}

/** Ana, Ben and Cara at the table; Ana and Ben own their tokens, Cara none. */
const seats: SeatSource = { onlinePlayers: () => [ANA, BEN, CARA], ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };

/** The party's map layers as the GM's renderer tells them: it sees the door. */
const partyLayers: MapLayerSource = { grid: () => null, rules: () => null, doorsSeen: () => new Set(['door']), pointsSeen: (points) => points.map(() => true), sensed: () => [] };

const bus = new EventEmitter();
const dice: DiceSource = { viewId: 'view-1', rollDice: () => null, rules: () => DEFAULT_DICE_RULES, on: (event, listener) => bus.on(event, listener), off: (event, listener) => bus.off(event, listener) };

/**
 * Where players' own pictures are cut from: the floor's picture worked out on the CPU, as for a floor
 * the GM does not look at, or the GM's renderer of the floor it shows (`pictureBasisOf`).
 */
type Basis = 'cpu' | 'renderer';
let basis: Basis = 'cpu';

async function started(state: SceneState, sharedVision: boolean): Promise<ShareHarness> {
  const table = shareHarness(state, IMAGES, seats);
  table.pages.join(ANA, BEN, CARA);
  if (basis === 'renderer') table.basis = pictureBasisOf(fakeAtlasTab({ state: () => table.state(), source: GENERIC_SOURCE, bounds: MAP }).renderer);
  table.settings = { ...PLAYER_SETTINGS, sharedVision, showDiceRolls: true };
  table.dice = dice;
  table.layers = partyLayers;
  table.perception = gmPerception(state, GENERIC_SOURCE, MAP);
  table.share.start();
  await table.set(state);
  await table.advance(1000);
  return table;
}

const page = (table: ShareHarness, player: string): PlayerPage => table.pages.of(player);
const names = (shown: PlayerPage): string[] => shown.tokens.map((entry) => entry.name ?? '?').sort();
/** Where the tokens stand that a player's page lights the scene from. */
const seers = (shown: PlayerPage): string[] => (shown.sight?.tokens ?? []).filter((entry) => entry.vision !== undefined).map(({ x, y }) => `${x},${y}`).sort();
type RollTold = Extract<GmMessage, { t: 'roll' }>;

/** The GM rolls for a token's statblock, which every player hears; the roll as each player was told it, and how many messages told it. */
function rollFor(table: ShareHarness, tokenId: string): { readonly to: (player: string) => RollTold | undefined; readonly messages: number } {
  const roll: DiceRollResult = {
    id: `roll_${tokenId}`, timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 0, total: 13, crit: null, player: 'Player',
    source: { type: 'statblock', tokenId, statblockPath: `Bestiary/${tokenId}.md`, tokenName: tokenId, tokenImagePath: `art/${tokenId}.webp`, abilityName: 'Bite' },
  };
  const from = table.sent.length;
  const mark = table.pages.mark();
  bus.emit('dice-rolled', roll, { viewId: 'view-1', mapPath: table.state().mapPath ?? '', tokenId });
  const heard = table.pages.since(mark, 'roll');
  return { to: (player) => heard[player]?.at(-1), messages: table.sent.slice(from).filter(({ body }) => body.t === 'roll').length };
}
const namesToken = (told: RollTold | undefined): boolean => told?.token != null && told.result.source?.abilityName === 'Bite';
const doors = (shown: PlayerPage): number => shown.last('doors')?.doors.length ?? 0;

describe.each<Basis>(['cpu', 'renderer'])('players\' own pictures cut from the %s picture', (from) => {
  beforeEach(() => {
    basis = from;
  });

  describe('Shared vision off', () => {
    it('lights each player\'s page from their own token alone and lists only what it sees', async () => {
      const table = await started(rooms(), false);
      const ana = page(table, ANA);
      const ben = page(table, BEN);
      expect(seers(ana)).toEqual(['200,200']);
      expect(seers(ben)).toEqual(['800,200']);
      expect(names(ana)).toEqual(['Ana', 'Rat']);
      expect(names(ben)).toEqual(['Ben', 'Goblin']);
    });

    it('never sends a player the name or place of a token only another player sees', async () => {
      const table = await started(rooms(), false);
      await table.set(rooms({ goblin: { x: 920 } }));
      await table.advance(1000);
      const ana = page(table, ANA);
      expect(JSON.stringify(ana.inbox)).not.toContain('Goblin');
      const places = ana.all('sight').flatMap((message) => message.tokens.map(({ x }) => x));
      expect(places).not.toContain(900);
      expect(places).not.toContain(920);
    });

    it('shows a player only the doors their own token sees', async () => {
      const table = await started(rooms(), false);
      expect(doors(page(table, ANA))).toBe(0);
      expect(doors(page(table, BEN))).toBe(1);
    });

    it('shows a player without a token of their own nothing live: their page is told it is blind', async () => {
      const table = await started(rooms(), false);
      const cara = page(table, CARA);
      expect(names(cara)).toEqual([]);
      expect(seers(cara)).toEqual([]);
      expect(cara.sight?.blind).toBe(true);
      expect(doors(cara)).toBe(0);
    });

    it('shows a player whose only character does not see that character alone, seeing nothing by it', async () => {
      const table = await started(rooms({ ana: { vision: { ...DARKVISION, enabled: false } } }), false);
      const ana = page(table, ANA);
      expect(names(ana)).toEqual(['Ana']);
      expect(ana.sight?.tokens.flatMap(({ x, vision }) => (vision === undefined ? [] : [{ x, vision }]))).toEqual([{ x: 200, vision: { senses: [], sightRange: 0 } }]);
      expect(page(table, BEN).sight?.blind).toBeUndefined();
    });

    it('lets a player move their own character that does not see, as an owner always may', async () => {
      const table = await started(rooms({ ana: { vision: { ...DARKVISION, enabled: false } } }), false);
      const listed = page(table, ANA).last('tokens');
      const ana = listed?.tokens.find((entry) => entry.name === 'Ana');
      table.share.receive(ANA, { t: 'move', scene: listed?.scene ?? '', id: ana?.id ?? '', x: 260, y: 200 });
      await table.settle();
      expect(table.state().objects.tokens.ana).toMatchObject({ x: 260, y: 200 });
    });
  });

  describe('rolls every player hears', () => {
    it('name a monster, with what it rolled for, only to the players whose own picture shows it', async () => {
      const off = await started(rooms(), false);
      const goblin = rollFor(off, 'goblin');
      expect(namesToken(goblin.to(BEN))).toBe(true);
      expect(goblin.to(ANA)).toMatchObject({ token: null, result: { source: { type: 'statblock' } } });
      expect(goblin.to(ANA)?.result.source?.abilityName).toBeUndefined();
      expect(goblin.to(CARA)?.token).toBeNull();
      bus.removeAllListeners();
    });

    it('name a player\'s own character, and a monster everyone sees, to all in one message', async () => {
      const off = await started(rooms(), false);
      const ben = rollFor(off, 'ben');
      expect(ben.messages).toBe(1);
      expect([ANA, BEN, CARA].every((player) => namesToken(ben.to(player)))).toBe(true);
      bus.removeAllListeners();
      const on = await started(rooms(), true);
      const goblin = rollFor(on, 'goblin');
      expect(goblin.messages).toBe(1);
      expect(namesToken(goblin.to(CARA))).toBe(true);
      bus.removeAllListeners();
    });
  });

  describe('readable pins with Shared vision off', () => {
    it('reach only a player whose own token sees them, and only that player may open them', async () => {
      const table = await started(rooms(), false);
      const pinsOf = (player: string): Extract<GmMessage, { t: 'pins' }> | undefined => page(table, player).last('pins');
      expect(pinsOf(ANA)?.pins).toEqual([]);
      const den = pinsOf(BEN)?.pins[0];
      const scene = pinsOf(BEN)?.scene ?? '';
      expect(den).toBeDefined();
      expect(table.share.layers.readablePin(BEN, scene, den?.id ?? '')?.pin.id).toBe('den');
      expect(table.share.layers.readablePin(ANA, scene, den?.id ?? '')).toBeNull();
    });
  });

  describe('the GM\'s aura around a token', () => {
    /** The GM keeps an aura around the goblin and an area in Ana's room, which players may see. */
    const auraAroundGoblin = (table: ShareHarness): void => {
      const records = { live: null, kept: [
        { id: 'aura', kind: 'measure', shape: 'circle', points: [{ x: 900, y: 300 }, { x: 1000, y: 300 }], follows: 'goblin', aura: 10 },
        { id: 'pool', kind: 'measure', shape: 'circle', points: [{ x: 250, y: 250 }, { x: 300, y: 250 }] },
      ] } as unknown as Measurements;
      table.marks = {
        measurements: { get: () => records, subscribe: () => () => undefined }, laser: new FakeLaser(), laserLook: () => ({ color: '#ff0059', size: 16 }), footprints: () => [],
        seen: () => (tokenId) => table.perception?.(tokenId) === 'seen',
      };
    };
    /** The areas `player` was last told of, an aura by `aura`. */
    const kept = (table: ShareHarness, player: string): string[] => (page(table, player).last('marks')?.measures ?? [])
      .flatMap((entry) => entry.full?.kept ?? []).map((area) => (area.aura === undefined ? 'area' : 'aura'));
    const marks = (table: ShareHarness): ShareHarness['sent'] => table.sent.filter(({ body }) => body.t === 'marks');

    it('is told, with Shared vision off, to each player whose own picture shows that token, and to nobody else', async () => {
      const off = await started(rooms(), false);
      auraAroundGoblin(off);
      await off.advance(2000);
      expect(kept(off, BEN)).toEqual(['aura', 'area']);
      expect(kept(off, ANA)).toEqual(['area']);
      expect(kept(off, CARA)).toEqual(['area']);
      expect(toAll(marks(off))).toEqual([]);
    });

    it('is told to all in one message where every picture agrees', async () => {
      const on = await started(rooms(), true);
      auraAroundGoblin(on);
      await on.advance(2000);
      expect(kept(on, ANA)).toEqual(['aura', 'area']);
      expect(marks(on).length).toBeGreaterThan(0);
      expect(toAll(marks(on))).toEqual(marks(on));
      // The goblin walks into the dark beyond Ben's door: with Shared vision off nobody sees it, and the area goes to all at once.
      const off = await started(rooms({ goblin: { x: 2500, y: 2500 } }), false);
      auraAroundGoblin(off);
      await off.advance(2000);
      expect(marks(off).length).toBeGreaterThan(0);
      expect(toAll(marks(off))).toEqual(marks(off));
      expect(kept(off, BEN)).toEqual(['area']);
    });
  });

  describe('Shared vision on', () => {
    it('sends every player the party\'s picture in one message to all, as before', async () => {
      const table = await started(rooms(), true);
      const pictures = table.sent.filter(({ body }) => body.t === 'tokens' || body.t === 'sight' || body.t === 'delta');
      expect(pictures.length).toBeGreaterThan(0);
      expect(toAll(pictures)).toEqual(pictures);
      for (const player of [ANA, BEN, CARA]) {
        expect(names(page(table, player))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
        expect(seers(page(table, player))).toEqual(['200,200', '800,200']);
      }
    });
  });

  describe('a player acting on a token only others see', () => {
    it('learns nothing of where it stands from a refused move', async () => {
      const table = await started(rooms(), true);
      const goblin = page(table, ANA).tokens.find((entry) => entry.name === 'Goblin');
      const scene = page(table, ANA).last('tokens')?.scene ?? '';
      table.settings = { ...PLAYER_SETTINGS, sharedVision: false };
      await table.advance(1000);
      table.share.receive(ANA, { t: 'move', scene, id: goblin?.id ?? '', x: 400, y: 400 });
      await table.settle();
      const refused = page(table, ANA).all('move-refused');
      expect(refused).toEqual([{ t: 'move-refused', scene, id: goblin?.id, x: null, y: null }]);
      expect(table.state().objects.tokens.goblin).toMatchObject({ x: 900, y: 300 });
    });
  });

  describe('remote mode, where everyone watches one screen and the phones are remotes', () => {
    it('sends every player the party\'s picture in one message to all, as the screen shows it', async () => {
      tableControlsStore.setState({ playMode: 'remote' });
      try {
        const table = await started(rooms(), false);
        const pictures = table.sent.filter(({ body }) => body.t === 'tokens' || body.t === 'sight' || body.t === 'delta');
        expect(pictures.length).toBeGreaterThan(0);
        expect(toAll(pictures)).toEqual(pictures);
        for (const player of [ANA, BEN, CARA]) expect(names(page(table, player))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
      } finally {
        tableControlsStore.setState({ playMode: 'table' });
      }
    });
  });

  describe('switching Shared vision during play', () => {
    it('moves players between their own picture and the party\'s, each time sent whole', async () => {
      const table = await started(rooms(), false);
      table.settings = { ...PLAYER_SETTINGS, sharedVision: true };
      await table.advance(1000);
      expect(names(page(table, ANA))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
      expect(seers(page(table, ANA))).toEqual(['200,200', '800,200']);
      table.settings = { ...PLAYER_SETTINGS, sharedVision: false };
      await table.advance(1000);
      expect(names(page(table, ANA))).toEqual(['Ana', 'Rat']);
      expect(seers(page(table, ANA))).toEqual(['200,200']);
      expect(names(page(table, CARA))).toEqual([]);
    });
  });
});
