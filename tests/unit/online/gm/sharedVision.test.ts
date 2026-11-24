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
import { fakeAtlasTab } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState, sequenced, shareHarness, token, tokenLists, type Sent, type ShareHarness } from './shareHarness.ts';

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

/** What one player was sent, in order: to them, and to all. */
const toPlayer = (sent: readonly Sent[], player: string): Sent[] => sent.filter(({ to }) => to === player || to === undefined);
const names = (sent: readonly Sent[]): string[] => (tokenLists(sent).at(-1)?.tokens ?? []).map((entry) => entry.name ?? '?').sort();
/** Where the tokens stand that a player's page lights the scene from. */
const seers = (sent: readonly Sent[]): string[] => (sequenced(sent, 'sight').at(-1)?.tokens ?? []).filter((entry) => entry.vision !== undefined).map(({ x, y }) => `${x},${y}`).sort();
/** The GM rolls for a token's statblock, which every player hears; the alias the roll names it by, if any. */
function rollFor(table: ShareHarness, tokenId: string): string | undefined {
  const roll: DiceRollResult = {
    id: `roll_${tokenId}`, timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 0, total: 13, crit: null, player: 'Player',
    source: { type: 'statblock', tokenId, statblockPath: `Bestiary/${tokenId}.md`, tokenName: tokenId, tokenImagePath: `art/${tokenId}.webp`, abilityName: 'Bite' },
  };
  bus.emit('dice-rolled', roll, { viewId: 'view-1', mapPath: table.state().mapPath ?? '', tokenId });
  const sent = table.sent.flatMap(({ body }): Extract<GmMessage, { t: 'roll' }>[] => (body.t === 'roll' ? [body] : [])).at(-1);
  return sent?.token ?? undefined;
}
const doors = (sent: readonly Sent[]): number => sent.flatMap(({ body }) => (body.t === 'doors' ? [body.doors.length] : [])).at(-1) ?? 0;

describe.each<Basis>(['cpu', 'renderer'])('players\' own pictures cut from the %s picture', (from) => {
  beforeEach(() => {
    basis = from;
  });

  describe('Shared vision off', () => {
    it('lights each player\'s page from their own token alone and lists only what it sees', async () => {
      const table = await started(rooms(), false);
      const ana = toPlayer(table.sent, ANA);
      const ben = toPlayer(table.sent, BEN);
      expect(seers(ana)).toEqual(['200,200']);
      expect(seers(ben)).toEqual(['800,200']);
      expect(names(ana)).toEqual(['Ana', 'Rat']);
      expect(names(ben)).toEqual(['Ben', 'Goblin']);
    });

    it('never sends a player the name or place of a token only another player sees', async () => {
      const table = await started(rooms(), false);
      await table.set(rooms({ goblin: { x: 920 } }));
      await table.advance(1000);
      const ana = toPlayer(table.sent, ANA);
      expect(JSON.stringify(ana.map(({ body }) => body))).not.toContain('Goblin');
      const places = sequenced(ana, 'sight').flatMap((message) => message.tokens.map(({ x }) => x));
      expect(places).not.toContain(900);
      expect(places).not.toContain(920);
    });

    it('shows a player only the doors their own token sees', async () => {
      const table = await started(rooms(), false);
      expect(doors(toPlayer(table.sent, ANA))).toBe(0);
      expect(doors(toPlayer(table.sent, BEN))).toBe(1);
    });

    it('sends a player without a token of their own the party\'s picture', async () => {
      const table = await started(rooms(), false);
      const cara = toPlayer(table.sent, CARA);
      expect(names(cara)).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
      expect(seers(cara)).toEqual(['200,200', '800,200']);
      expect(doors(cara)).toBe(1);
    });

    it('sends a player whose own token does not see the party\'s picture', async () => {
      const table = await started(rooms({ ana: { vision: { ...DARKVISION, enabled: false } } }), false);
      expect(names(toPlayer(table.sent, ANA))).toEqual(names(toPlayer(table.sent, CARA)));
      expect(seers(toPlayer(table.sent, ANA))).toEqual(['800,200']);
    });
  });

  describe('rolls every player hears', () => {
    it('name a monster only while every player sees it, and a player\'s own character always', async () => {
      const off = await started(rooms(), false);
      expect(rollFor(off, 'goblin')).toBeUndefined();
      expect(rollFor(off, 'ben')).toBeDefined();
      bus.removeAllListeners();
      const on = await started(rooms(), true);
      expect(rollFor(on, 'goblin')).toBeDefined();
      bus.removeAllListeners();
    });
  });

  describe('readable pins with Shared vision off', () => {
    it('reach only a player whose own token sees them, and only that player may open them', async () => {
      const table = await started(rooms(), false);
      const pinsOf = (player: string): Extract<GmMessage, { t: 'pins' }> | undefined => toPlayer(table.sent, player).flatMap(({ body }) => (body.t === 'pins' ? [body] : [])).at(-1);
      expect(pinsOf(ANA)?.pins).toEqual([]);
      const den = pinsOf(BEN)?.pins[0];
      const scene = pinsOf(BEN)?.scene ?? '';
      expect(den).toBeDefined();
      expect(table.share.layers.readablePin(BEN, scene, den?.id ?? '')?.pin.id).toBe('den');
      expect(table.share.layers.readablePin(ANA, scene, den?.id ?? '')).toBeNull();
    });
  });

  describe('Shared vision on', () => {
    it('sends every player the party\'s picture in one message to all, as before', async () => {
      const table = await started(rooms(), true);
      const sequencedTo = new Set(table.sent.filter(({ body }) => body.t === 'tokens' || body.t === 'sight' || body.t === 'delta').map(({ to }) => to));
      expect(sequencedTo).toEqual(new Set([undefined]));
      expect(names(table.sent)).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
      expect(seers(table.sent)).toEqual(['200,200', '800,200']);
    });
  });

  describe('a player acting on a token only others see', () => {
    it('learns nothing of where it stands from a refused move', async () => {
      const table = await started(rooms(), true);
      const goblin = tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.name === 'Goblin');
      const scene = tokenLists(table.sent).at(-1)?.scene ?? '';
      table.settings = { ...PLAYER_SETTINGS, sharedVision: false };
      await table.advance(1000);
      table.share.receive(ANA, { t: 'move', scene, id: goblin?.id ?? '', x: 400, y: 400 });
      await table.settle();
      const refused = toPlayer(table.sent, ANA).flatMap(({ body }) => (body.t === 'move-refused' ? [body] : []));
      expect(refused).toEqual([{ t: 'move-refused', scene, id: goblin?.id, x: null, y: null }]);
      expect(table.state().objects.tokens.goblin).toMatchObject({ x: 900, y: 300 });
    });
  });

  describe('switching Shared vision during play', () => {
    it('moves players between their own picture and the party\'s, each time sent whole', async () => {
      const table = await started(rooms(), false);
      table.settings = { ...PLAYER_SETTINGS, sharedVision: true };
      await table.advance(1000);
      expect(names(toPlayer(table.sent, ANA))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
      expect(seers(toPlayer(table.sent, ANA))).toEqual(['200,200', '800,200']);
      table.settings = { ...PLAYER_SETTINGS, sharedVision: false };
      await table.advance(1000);
      expect(names(toPlayer(table.sent, ANA))).toEqual(['Ana', 'Rat']);
      expect(seers(toPlayer(table.sent, ANA))).toEqual(['200,200']);
      expect(names(toPlayer(table.sent, CARA))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
    });
  });
});
