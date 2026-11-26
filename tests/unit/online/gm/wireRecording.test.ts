import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import type { DiceSource } from '../../../../src/app/online/gm/atlasDice.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { Measurements } from '../../../../src/app/pixi/measure/measurements';
import type { TokenEntity } from '../../../../src/app/types';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import { FakeLaser } from './markHarness.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

/*
 * Every message each page receives over a scripted session, as the wire carries it: whether it came to all
 * or to that page alone, its kind and a digest of all it says. Who gets which message is worked out in one place, and a change of where must not change one
 * message, so the recording is compared whole. The steps: Shared vision switched both ways, the GM's
 * aura and a player's laser, a token taking the stairs, players joining, leaving and coming back, the
 * GM's Atlas coming back to a running table, another floor presented, a roll, and another map.
 */

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const DAN = 'd'.repeat(20);
const SHORT: Readonly<Record<string, string>> = { [ANA]: 'ana', [BEN]: 'ben', [CARA]: 'cara', [DAN]: 'dan' };
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN, dan: DAN };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ['maps/ground.webp', new Uint8Array([1, 2, 3])], ['maps/upper.webp', new Uint8Array([3, 2, 1])], ['maps/vault.webp', new Uint8Array([7, 7, 7])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
];
const WALL: WallSegment = { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } } as WallSegment;

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

/** A dark scene: Ana and a rat in one room, Ben and a goblin beyond the wall, upstairs where `floors` is 2; `tokens` over them. */
function scene(floors: 1 | 2, tokens: Readonly<Record<string, Partial<TokenEntity>>> = {}, changes: Partial<SceneState> = {}): SceneState {
  const upper = floors === 2 ? { level: 'upper' } : {};
  const all: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION, ...upper }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300, ...upper }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...(all[id] ?? character(id, id, {})), ...change } as TokenEntity;
  const base = sceneState({ lighting: { enabled: true, ambient: 0 }, ...(floors === 2 && { levels: LEVELS, viewedLevel: 'ground', background: 'maps/ground.webp' }), ...changes });
  return { ...base, objects: { ...base.objects, walls: floors === 1 ? { between: WALL } : {}, tokens: all } };
}

const bus = new EventEmitter();
const dice: DiceSource = { viewId: 'view-1', rollDice: () => null, rules: () => DEFAULT_DICE_RULES, on: (event, listener) => bus.on(event, listener), off: (event, listener) => bus.off(event, listener) };

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A page's ids, numbered as they first reach it: the floors read their maps side by side, so which one draws its ids first varies. */
class PageIds {
  private readonly known = new Map<string, string>();

  of(text: string): string {
    return text.replace(/\b[0-9a-f]{24}\b/g, (id) => {
      if (!this.known.has(id)) this.known.set(id, `#${this.known.size}`);
      return this.known.get(id)!;
    });
  }
}

/**
 * What reached each page, step by step: one line per message, the page, whether it came in one message to all
 * (`*`) or to that page alone (`>`), its kind and a digest of all it says.
 */
class Recording {
  readonly lines: string[] = [];
  private readonly read = new Map<string, number>();
  private readonly ids = new Map<string, PageIds>();

  constructor(private readonly harness: ShareHarness) {}

  step(name: string): void {
    this.lines.push(`# ${name}`);
    for (const player of Object.keys(SHORT)) {
      let page;
      try {
        page = this.harness.pages.of(player);
      } catch {
        continue;
      }
      const ids = this.ids.get(player) ?? new PageIds();
      this.ids.set(player, ids);
      page.inbox.slice(this.read.get(player) ?? 0).forEach((body, index, fresh) => {
        const via = page.toAll[page.inbox.length - fresh.length + index] === true ? '*' : '>';
        const kind = body.t === 'delta' ? `delta/${body.of}` : body.t;
        this.lines.push(`${SHORT[player]} ${via} ${kind} ${digest(ids.of(JSON.stringify(body))).slice(0, 16)}`);
      });
      this.read.set(player, page.inbox.length);
    }
  }
}

interface Session {
  readonly harness: ShareHarness;
  readonly record: Recording;
  readonly online: string[];
  set(next: SceneState): Promise<void>;
  join(player: string): Promise<void>;
  leave(player: string): Promise<void>;
  sharedVision(on: boolean): Promise<void>;
  laser(player: string): Promise<void>;
  roll(tokenId: string): Promise<void>;
}

async function session(start: SceneState, players: readonly string[]): Promise<Session> {
  const online = [...players];
  const seats: SeatSource = { onlinePlayers: () => online, ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
  const harness = shareHarness(start, IMAGES, seats);
  harness.pages.join(...players);
  harness.settings = { ...PLAYER_SETTINGS, sharedVision: false, showDiceRolls: true };
  harness.dice = dice;
  harness.perception = gmPerception(start, GENERIC_SOURCE, MAP);
  const aura = { live: null, kept: [{ id: 'aura', kind: 'measure', shape: 'circle', points: [{ x: 900, y: 300 }, { x: 1000, y: 300 }], follows: 'goblin', aura: 10 }] } as unknown as Measurements;
  harness.marks = {
    measurements: { get: () => aura, subscribe: () => () => undefined }, laser: new FakeLaser(), laserLook: () => ({ color: '#ff0059', size: 16 }), footprints: () => [],
    seen: () => (tokenId) => harness.perception?.(tokenId) === 'seen',
  };
  if (start.levels !== undefined) harness.presented = 'ground';
  harness.share.start();
  await harness.set(start);
  await harness.advance(2000);
  const record = new Recording(harness);
  record.step('start');
  return {
    harness,
    record,
    online,
    set: async (next) => {
      harness.perception = gmPerception(next, GENERIC_SOURCE, MAP);
      await harness.set(next);
      await harness.advance(2000);
    },
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
    sharedVision: async (on) => {
      harness.settings = { ...harness.settings, sharedVision: on };
      await harness.advance(2000);
    },
    laser: async (player) => {
      const scene = harness.pages.of(player).scene?.id ?? '';
      harness.share.receive(player, { t: 'laser', scene, color: '#66ffa9', size: 16, at: [150, 150], pts: [150, 150, 160, 150], on: true });
      await harness.advance(300);
    },
    roll: async (tokenId) => {
      const roll: DiceRollResult = {
        id: `roll_${tokenId}`, timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 0, total: 13, crit: null, player: 'Player',
        source: { type: 'statblock', tokenId, statblockPath: `Bestiary/${tokenId}.md`, tokenName: tokenId, tokenImagePath: `art/${tokenId}.webp`, abilityName: 'Bite' },
      };
      bus.emit('dice-rolled', roll, { viewId: 'view-1', mapPath: harness.state().mapPath ?? '', tokenId });
      await harness.advance(100);
    },
  };
}

/** The recording whole, and a digest of it, which the file names first so a change shows at a glance. */
function written(lines: readonly string[]): string {
  const text = lines.join('\n');
  return `sha256 ${digest(text)}\n${text}\n`;
}

describe('the messages of a scripted session', () => {
  it('on one floor stay as they were recorded', async () => {
    const s = await session(scene(1), [ANA, BEN, CARA]);
    await s.set(scene(1, { rat: { x: 320 } }));
    s.record.step('the rat moves');
    await s.laser(BEN);
    s.record.step('Ben points');
    await s.sharedVision(true);
    s.record.step('Shared vision on');
    await s.set(scene(1, { rat: { x: 320 }, goblin: { x: 950 } }));
    s.record.step('the goblin moves');
    await s.roll('goblin');
    s.record.step('a roll for the goblin');
    await s.sharedVision(false);
    s.record.step('Shared vision off');
    await s.roll('goblin');
    s.record.step('a roll for the goblin, Shared vision off');
    await s.join(DAN);
    s.record.step('Dan joins');
    await s.leave(BEN);
    s.record.step('Ben leaves');
    await s.set(scene(1, { rat: { x: 340 }, goblin: { x: 950 } }));
    s.record.step('the rat moves while Ben is away');
    await s.join(BEN);
    s.record.step('Ben comes back');
    s.harness.share.resend();
    await s.harness.advance(2000);
    s.record.step('the GM comes back to the table');
    await s.set(scene(1, { rat: { x: 340 }, goblin: { x: 950 } }, { mapPath: 'Scenes/Vault.atlasmap', background: 'maps/vault.webp' }));
    s.record.step('another map');
    await expect(written(s.record.lines)).toMatchFileSnapshot('./recordings/oneFloorSession.wire.txt');
  });

  it('on two floors stay as they were recorded', async () => {
    const s = await session(scene(2), [ANA, BEN, CARA]);
    await s.laser(BEN);
    s.record.step('Ben points upstairs');
    await s.laser(ANA);
    s.record.step('Ana points downstairs');
    await s.sharedVision(true);
    s.record.step('Shared vision on');
    await s.set(scene(2, { rat: { x: 320 } }));
    s.record.step('the rat moves');
    await s.set(scene(2, { rat: { x: 320 }, ana: { level: 'upper', x: 700 } }));
    s.record.step('Ana takes the stairs');
    await s.set(scene(2, { rat: { x: 320 }, ana: { level: 'upper', x: 720 } }));
    s.record.step('Ana walks upstairs');
    await s.sharedVision(false);
    s.record.step('Shared vision off');
    await s.join(DAN);
    s.record.step('Dan joins without a token');
    await s.set(scene(2, { rat: { x: 320 }, ana: { level: 'upper', x: 720 }, dan: { x: 250, y: 300, level: 'ground', vision: DARKVISION } }));
    s.record.step('Dan is given a token on the ground');
    await s.roll('rat');
    s.record.step('a roll for the rat');
    await s.leave(BEN);
    s.record.step('Ben leaves');
    await s.join(BEN);
    s.record.step('Ben comes back');
    s.harness.presented = 'upper';
    await s.harness.advance(2000);
    s.record.step('Atlas presents the upper floor');
    await s.set(scene(2, { rat: { x: 320 }, ana: { level: 'ground', x: 200 }, ben: { level: 'ground', x: 260 }, dan: { x: 250, y: 300, level: 'ground', vision: DARKVISION } }));
    s.record.step('everyone downstairs');
    s.harness.presented = 'ground';
    await s.harness.advance(2000);
    s.record.step('Atlas presents the ground again, where everyone stands');
    await s.sharedVision(true);
    s.record.step('Shared vision on, everyone downstairs');
    s.harness.share.resend();
    await s.harness.advance(2000);
    s.record.step('the GM comes back to the table');
    await s.set(scene(2, { rat: { x: 320 }, ana: { level: 'ground', x: 200 }, ben: { level: 'ground', x: 260 }, dan: { x: 250, y: 300, level: 'ground', vision: DARKVISION } }, { mapPath: 'Scenes/Keep.atlasmap' }));
    s.record.step('another map');
    bus.removeAllListeners();
    await expect(written(s.record.lines)).toMatchFileSnapshot('./recordings/twoFloorSession.wire.txt');
  });
});
