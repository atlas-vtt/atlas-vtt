import { EventEmitter } from 'node:events';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import type { DiceSource } from '../../../../src/app/online/gm/atlasDice.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { Measurements } from '../../../../src/app/pixi/measure/measurements';
import type { TokenEntity } from '../../../../src/app/types';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { afterEach, describe, expect, it } from 'vitest';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import { FakeLaser } from './markHarness.ts';
import type { Mark, PlayerPage } from './playerPages.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

/*
 * Which pages get which picture's messages: each player's page shows the floor they stand on, through the
 * party's eyes or their own, and a picture goes to every page at once only where everyone shares it. Each
 * row sets players, tokens, floors and Shared vision, plays a few steps (a player joining mid-scene,
 * leaving, coming back, a token taking the stairs) and names the picture each page shows after the last.
 */

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const DAN = 'd'.repeat(20);
const NAMES: Readonly<Record<string, string>> = { [ANA]: 'Ana', [BEN]: 'Ben', [CARA]: 'Cara', [DAN]: 'Dan' };
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN, dan: DAN };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ['maps/ground.webp', new Uint8Array([1, 2, 3])], ['maps/upper.webp', new Uint8Array([3, 2, 1])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
];
/** The wall between Ana's room and Ben's. */
const WALL: WallSegment = { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } } as WallSegment;

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

interface Scene {
  /** Two floors: Ana and the rat on the ground, which Atlas presents, Ben and the goblin upstairs. One: both rooms on one floor, a wall between. */
  readonly floors: 1 | 2;
  /** Whether the scene is dark and token vision hides what nobody sees (else sight hides nothing). */
  readonly lit?: boolean;
  /** Changes to the tokens, a token added where it is new. */
  readonly tokens?: Readonly<Record<string, Partial<TokenEntity>>>;
}

/** Ana with a rat in her room, Ben with a goblin in his; both see by darkvision, neither through the wall nor to the other floor. */
function scene({ floors, lit = true, tokens = {} }: Scene): SceneState {
  const upper = floors === 2 ? { level: 'upper' } : {};
  const all: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION, ...upper }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300, ...upper }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...(all[id] ?? character(id, id[0]!.toUpperCase() + id.slice(1), {})), ...change } as TokenEntity;
  const base = sceneState({ lighting: { enabled: lit, ambient: lit ? 0 : 1 }, ...(floors === 2 && { levels: LEVELS, viewedLevel: 'ground', background: 'maps/ground.webp' }) });
  return { ...base, objects: { ...base.objects, walls: floors === 1 ? { between: WALL } : {}, tokens: all } };
}

const bus = new EventEmitter();
const dice: DiceSource = { viewId: 'view-1', rollDice: () => null, rules: () => DEFAULT_DICE_RULES, on: (event, listener) => bus.on(event, listener), off: (event, listener) => bus.off(event, listener) };

interface Table {
  readonly harness: ShareHarness;
  /** The players connected and seated now. */
  readonly online: string[];
  /** A player joins mid-scene, as the table takes them: their page connects, is sent the scene, then they are seated. */
  join(player: string): Promise<void>;
  /** A player's page goes, then the table lets them go, as the relay tells it. */
  leave(player: string): Promise<void>;
  /** A store change. */
  set(changes: Scene): Promise<void>;
  sharedVision(on: boolean): Promise<void>;
}

/**
 * A table of these players on a scene; `placed` false is a GM coming back to a running table: the pages
 * are connected and sent the scene before the GM has seated anyone. The GM keeps an aura around the goblin.
 */
async function table(start: Scene, sharedVision: boolean, players: readonly string[] = [ANA, BEN, CARA], placed = true): Promise<Table> {
  const online: string[] = placed ? [...players] : [];
  const seats: SeatSource = { onlinePlayers: () => online, ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
  const state = scene(start);
  const harness = shareHarness(state, IMAGES, seats);
  harness.pages.join(...players);
  harness.settings = { ...PLAYER_SETTINGS, sharedVision, showDiceRolls: true };
  harness.dice = dice;
  harness.perception = gmPerception(state, GENERIC_SOURCE, MAP);
  const aura = { live: null, kept: [{ id: 'aura', kind: 'measure', shape: 'circle', points: [{ x: 900, y: 300 }, { x: 1000, y: 300 }], follows: 'goblin', aura: 10 }] } as unknown as Measurements;
  harness.marks = {
    measurements: { get: () => aura, subscribe: () => () => undefined }, laser: new FakeLaser(), laserLook: () => ({ color: '#ff0059', size: 16 }), footprints: () => [],
    seen: () => (tokenId) => harness.perception?.(tokenId) === 'seen',
  };
  if (start.floors === 2) harness.presented = 'ground';
  harness.share.start();
  await harness.set(state);
  if (!placed) harness.share.resend();
  await harness.advance(2000);
  const changed = async (next: SceneState): Promise<void> => {
    harness.perception = gmPerception(next, GENERIC_SOURCE, MAP);
    await harness.set(next);
    await harness.advance(2000);
  };
  return {
    harness,
    online,
    join: async (player) => {
      harness.pages.join(player);
      harness.share.resend(player);
      online.push(player);
      harness.share.ownersChanged();
      await harness.advance(2000);
    },
    leave: async (player) => {
      harness.pages.leave(player);
      harness.share.playerLeft(player);
      online.splice(online.indexOf(player), 1);
      harness.share.ownersChanged();
      await harness.advance(2000);
    },
    set: (changes) => changed(scene(changes)),
    sharedVision: async (on) => {
      harness.settings = { ...harness.settings, sharedVision: on };
      await harness.advance(2000);
    },
  };
}

/** The picture a page shows: its floor, then the tokens of its last list, that it sees nothing live, or that it was sent no picture. */
function pictureOf(page: PlayerPage): string {
  const { scene: shown } = page;
  if (shown === undefined || shown === null) return 'no scene';
  const floor = shown.floor === undefined ? 'only' : ['ground', 'upper'][shown.floor.level]!;
  if (page.last('tokens') === undefined) return `${floor}: no picture`;
  if (page.sight?.blind === true) return `${floor}: blind`;
  return `${floor}: ${page.tokens.map((entry) => entry.name ?? '?').sort().join(' ') || 'none'}`;
}

/** The picture each connected player's page shows, by name. */
function pictures(t: Table, players: readonly string[]): Record<string, string> {
  return Object.fromEntries(players.map((player) => [NAMES[player], pictureOf(t.harness.pages.of(player))]));
}

/** How the pictures' messages (token lists, sight inputs and their deltas) of the last step went out: once to all, to each page, or not at all. */
function sentAs(t: Table, from: number): 'all' | 'each' | 'mixed' | 'none' {
  const kinds = new Set(['tokens', 'sight']);
  const sent = t.harness.sent.slice(from).filter(({ body }) => kinds.has(body.t) || (body.t === 'delta' && kinds.has(body.of)));
  if (sent.length === 0) return 'none';
  const toAll = sent.filter(({ to }) => to === undefined).length;
  return toAll === sent.length ? 'all' : toAll === 0 ? 'each' : 'mixed';
}

/** Whom the GM's roll for the goblin names it to, and in how many messages. */
function goblinRoll(t: Table): { readonly namedTo: string[]; readonly messages: number } {
  const roll: DiceRollResult = {
    id: 'roll_goblin', timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 0, total: 13, crit: null, player: 'Player',
    source: { type: 'statblock', tokenId: 'goblin', statblockPath: 'Bestiary/goblin.md', tokenName: 'goblin', tokenImagePath: 'art/goblin.webp', abilityName: 'Bite' },
  };
  const from = t.harness.sent.length;
  const mark: Mark = t.harness.pages.mark();
  bus.emit('dice-rolled', roll, { viewId: 'view-1', mapPath: t.harness.state().mapPath ?? '', tokenId: 'goblin' });
  const heard = t.harness.pages.since(mark, 'roll');
  const namedTo = Object.entries(heard).filter(([, rolls]) => rolls.at(-1)?.token != null).map(([player]) => NAMES[player]!).sort();
  return { namedTo, messages: t.harness.sent.slice(from).filter(({ body }) => body.t === 'roll').length };
}

/** The pages last told the GM's aura around the goblin, and how the marks that told it went out. */
function goblinAura(t: Table, players: readonly string[]): { readonly toldTo: string[]; readonly sent: 'all' | 'each' | 'none' } {
  const toldTo = players.filter((player) => (t.harness.pages.of(player).last('marks')?.measures ?? []).some((entry) => (entry.full?.kept ?? []).some((area) => area.aura !== undefined)));
  const marks = t.harness.sent.filter(({ body }) => body.t === 'marks');
  const last = marks.at(-1);
  return { toldTo: toldTo.map((player) => NAMES[player]!).sort(), sent: last === undefined ? 'none' : last.to === undefined ? 'all' : 'each' };
}

afterEach(() => {
  bus.removeAllListeners();
});

describe('the pages of one floor', () => {
  it.each([
    { sharedVision: true, lit: true, shows: { Ana: 'only: Ana Ben Goblin Rat', Ben: 'only: Ana Ben Goblin Rat', Cara: 'only: Ana Ben Goblin Rat' }, sent: 'all' },
    { sharedVision: false, lit: true, shows: { Ana: 'only: Ana Rat', Ben: 'only: Ben Goblin', Cara: 'only: blind' }, sent: 'each' },
    { sharedVision: false, lit: false, shows: { Ana: 'only: Ana Ben Goblin Rat', Ben: 'only: Ana Ben Goblin Rat', Cara: 'only: Ana Ben Goblin Rat' }, sent: 'all' },
  ])('Shared vision $sharedVision, lit $lit: each page shows its picture, sent $sent', async ({ sharedVision, lit, shows, sent }) => {
    const t = await table({ floors: 1, lit }, sharedVision);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual(shows);
    expect(sentAs(t, 0)).toBe(sent);
  });

  it.each([
    { sharedVision: false, before: { Ana: 'only: no picture', Ben: 'only: no picture' }, sentBefore: 'none', after: { Ana: 'only: Ana Rat', Ben: 'only: Ben Goblin' }, sentAfter: 'each' },
    { sharedVision: true, before: { Ana: 'only: Ana Ben Goblin Rat', Ben: 'only: Ana Ben Goblin Rat' }, sentBefore: 'all', after: { Ana: 'only: Ana Ben Goblin Rat', Ben: 'only: Ana Ben Goblin Rat' }, sentAfter: 'none' },
  ])('a GM coming back with Shared vision $sharedVision sends a page not placed yet $sentBefore of anyone\'s picture, then each their own', async ({ sharedVision, before, sentBefore, after, sentAfter }) => {
    const t = await table({ floors: 1 }, sharedVision, [ANA, BEN], false);
    expect(pictures(t, [ANA, BEN])).toEqual(before);
    expect(sentAs(t, 0)).toBe(sentBefore);
    const from = t.harness.sent.length;
    t.online.push(ANA, BEN);
    t.harness.share.ownersChanged();
    await t.harness.advance(2000);
    expect(pictures(t, [ANA, BEN])).toEqual(after);
    expect(sentAs(t, from)).toBe(sentAfter);
  });

  it.each([
    { sharedVision: false, shows: { Ana: 'only: Ana Rat', Ben: 'only: Ben Goblin', Cara: 'only: blind' }, toCara: 'each' },
    { sharedVision: true, shows: { Ana: 'only: Ana Ben Goblin Rat', Ben: 'only: Ana Ben Goblin Rat', Cara: 'only: Ana Ben Goblin Rat' }, toCara: 'each' },
  ])('a player who joins mid-scene with Shared vision $sharedVision is sent their picture alone', async ({ sharedVision, shows, toCara }) => {
    const t = await table({ floors: 1 }, sharedVision, [ANA, BEN]);
    const from = t.harness.sent.length;
    const others = [t.harness.pages.of(ANA).inbox.length, t.harness.pages.of(BEN).inbox.length];
    await t.join(CARA);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual(shows);
    expect(sentAs(t, from)).toBe(toCara);
    expect([t.harness.pages.of(ANA).inbox.length, t.harness.pages.of(BEN).inbox.length]).toEqual(others);
  });

  it.each([false, true])('a player who leaves hears nothing more, and the others keep their pictures (Shared vision %s)', async (sharedVision) => {
    const t = await table({ floors: 1 }, sharedVision);
    await t.leave(BEN);
    const heard = t.harness.pages.of(BEN).inbox.length;
    await t.set({ floors: 1, tokens: { goblin: { x: 950 }, rat: { x: 320 } } });
    expect(t.harness.pages.of(BEN).inbox.length).toBe(heard);
    expect(pictures(t, [ANA, CARA])).toEqual(sharedVision ? { Ana: 'only: Ana Ben Goblin Rat', Cara: 'only: Ana Ben Goblin Rat' } : { Ana: 'only: Ana Rat', Cara: 'only: blind' });
  });

  it('a player who comes back is sent their picture again, whole, to their page alone', async () => {
    const t = await table({ floors: 1 }, false);
    await t.leave(BEN);
    const from = t.harness.sent.length;
    await t.join(BEN);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'only: Ana Rat', Ben: 'only: Ben Goblin', Cara: 'only: blind' });
    // Once as the picture it reaches begins, once as the page is sent everything whole.
    expect(t.harness.sent.slice(from).filter(({ body }) => body.t === 'tokens').map(({ to }) => to && NAMES[to])).toEqual(['Ben', 'Ben']);
  });

  it('switching Shared vision moves every page between the party\'s picture and its own', async () => {
    const t = await table({ floors: 1 }, false);
    let from = t.harness.sent.length;
    await t.sharedVision(true);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'only: Ana Ben Goblin Rat', Ben: 'only: Ana Ben Goblin Rat', Cara: 'only: Ana Ben Goblin Rat' });
    expect(sentAs(t, from)).toBe('each');
    await t.set({ floors: 1, tokens: { rat: { x: 320 } } });
    from = t.harness.sent.length;
    await t.set({ floors: 1, tokens: { rat: { x: 340 } } });
    expect(sentAs(t, from)).toBe('all');
    from = t.harness.sent.length;
    await t.sharedVision(false);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'only: Ana Rat', Ben: 'only: Ben Goblin', Cara: 'only: blind' });
    expect(sentAs(t, from)).toBe('each');
  });
});

describe('the pages of a scene of two floors', () => {
  it.each([
    { sharedVision: true, shows: { Ana: 'ground: Ana Rat', Ben: 'upper: Ben Goblin', Cara: 'ground: Ana Rat' } },
    { sharedVision: false, shows: { Ana: 'ground: Ana Rat', Ben: 'upper: Ben Goblin', Cara: 'ground: blind' } },
  ])('Shared vision $sharedVision: each page shows its own floor, nothing to all', async ({ sharedVision, shows }) => {
    const t = await table({ floors: 2 }, sharedVision);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual(shows);
    expect(sentAs(t, 0)).toBe('each');
  });

  it('every player on the floor Atlas presents shares it in one message to all', async () => {
    const t = await table({ floors: 2, tokens: { ben: { level: 'ground' } } }, true);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'ground: Ana Ben Rat', Ben: 'ground: Ana Ben Rat', Cara: 'ground: Ana Ben Rat' });
    expect(sentAs(t, 0)).toBe('all');
  });

  it('a token of a player who is not connected on another floor keeps the presented floor from going to all', async () => {
    const t = await table({ floors: 2, tokens: { ben: { level: 'ground' }, dan: { x: 600, y: 600, level: 'upper' } } }, true);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'ground: Ana Ben Rat', Ben: 'ground: Ana Ben Rat', Cara: 'ground: Ana Ben Rat' });
    expect(sentAs(t, 0)).toBe('each');
  });

  it.each([true, false])('a player whose token takes the stairs is sent the floor it reached, and nothing more of the one it left (Shared vision %s)', async (sharedVision) => {
    const t = await table({ floors: 2 }, sharedVision);
    await t.set({ floors: 2, tokens: { ana: { level: 'upper', x: 700 } } });
    const mark = t.harness.pages.mark();
    await t.set({ floors: 2, tokens: { ana: { level: 'upper', x: 720 }, rat: { x: 320 } } });
    // Upstairs Ana's darkvision reaches Ben and the goblin; downstairs nobody sees anything now.
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'upper: Ana Ben Goblin', Ben: 'upper: Ana Ben Goblin', Cara: 'ground: blind' });
    const upper = t.harness.pages.of(BEN).scene?.id;
    for (const body of t.harness.pages.of(ANA).since(mark)) if ('scene' in body && typeof body.scene === 'string') expect(body.scene).toBe(upper);
  });

  it.each([true, false])('a player who joins mid-scene without a token stands on the presented floor (Shared vision %s)', async (sharedVision) => {
    const t = await table({ floors: 2 }, sharedVision, [ANA, BEN]);
    await t.join(CARA);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'ground: Ana Rat', Ben: 'upper: Ben Goblin', Cara: sharedVision ? 'ground: Ana Rat' : 'ground: blind' });
  });

  it('a player who leaves the only other floor closes it: they hear nothing more, the others keep theirs', async () => {
    const t = await table({ floors: 2 }, true);
    await t.leave(BEN);
    const heard = t.harness.pages.of(BEN).inbox.length;
    await t.set({ floors: 2, tokens: { goblin: { x: 950, level: 'upper' }, rat: { x: 320 } } });
    expect(t.harness.pages.of(BEN).inbox.length).toBe(heard);
    expect(pictures(t, [ANA, CARA])).toEqual({ Ana: 'ground: Ana Rat', Cara: 'ground: Ana Rat' });
  });

  it('a player who comes back is sent the floor of their token again', async () => {
    const t = await table({ floors: 2 }, false);
    await t.leave(BEN);
    await t.join(BEN);
    expect(pictures(t, [ANA, BEN, CARA])).toEqual({ Ana: 'ground: Ana Rat', Ben: 'upper: Ben Goblin', Cara: 'ground: blind' });
  });
});

describe('who is told a token', () => {
  /** On two floors the goblin stands on the ground the GM looks at, beside Ana's room; Ben is upstairs. */
  const goblinScene = (floors: 1 | 2): Scene => (floors === 1 ? { floors } : { floors, tokens: { goblin: { level: 'ground', x: 300, y: 300 } } });

  it.each([
    { floors: 1, sharedVision: false, namedTo: ['Ben'], messages: 3 },
    { floors: 1, sharedVision: true, namedTo: ['Ana', 'Ben', 'Cara'], messages: 1 },
    { floors: 2, sharedVision: true, namedTo: ['Ana', 'Cara'], messages: 3 },
    { floors: 2, sharedVision: false, namedTo: ['Ana'], messages: 3 },
  ] as const)('a roll for the goblin on $floors floor(s), Shared vision $sharedVision, names it to $namedTo', async ({ floors, sharedVision, namedTo, messages }) => {
    const t = await table(goblinScene(floors), sharedVision);
    expect(goblinRoll(t)).toEqual({ namedTo, messages });
  });

  it.each([
    { floors: 1, sharedVision: false, toldTo: ['Ben'], sent: 'each' },
    { floors: 1, sharedVision: true, toldTo: ['Ana', 'Ben', 'Cara'], sent: 'all' },
    { floors: 2, sharedVision: true, toldTo: ['Ana', 'Cara'], sent: 'each' },
    { floors: 2, sharedVision: false, toldTo: ['Ana'], sent: 'each' },
  ] as const)('the GM\'s aura around the goblin on $floors floor(s), Shared vision $sharedVision, is told to $toldTo', async ({ floors, sharedVision, toldTo, sent }) => {
    const t = await table(goblinScene(floors), sharedVision);
    expect(goblinAura(t, [ANA, BEN, CARA])).toEqual({ toldTo, sent });
  });
});
