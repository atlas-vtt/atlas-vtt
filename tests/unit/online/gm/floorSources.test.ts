import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { NotePin, TokenEntity } from '../../../../src/app/types';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { pictureBasisOf } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import { gmTabOf } from '../../../../src/app/online/gm/gmTab.ts';
import { fakeAtlasTab, fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import { GRID_SIZE, sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

/*
 * The floor the GM's view shows is read from the GM's renderer once the renderer has drawn it, and worked out on
 * the CPU until then, as every floor the GM does not look at is. Players must not tell the two apart: one
 * scripted session is played on a floor read each way, and every page receives the same messages, step by step.
 * The renderer answers by Atlas's own lighting over the store (`fakeAtlasTab`), handed to the share either as the
 * harness's parts or read through the GM's tab itself (`gmTabOf`), which then also decides which way the floor is read.
 */

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const DAN = 'd'.repeat(20);
const SHORT: Readonly<Record<string, string>> = { [ANA]: 'ana', [BEN]: 'ben', [CARA]: 'cara', [DAN]: 'dan' };
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN, cara: CARA };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/ground.webp', new Uint8Array([1, 2, 3])], ['maps/upper.webp', new Uint8Array([3, 2, 1])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
];

/** The wall between Ana's room and Ben's (a door in it once `door` is set), and a door at the far side of Ben's. */
function walls(door: 'none' | 'closed' | 'open'): Record<string, WallSegment> {
  const between = door === 'none'
    ? { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } }
    : { id: 'between', kind: 'wall', type: 'door', closed: door === 'closed', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } };
  return {
    between: between as WallSegment,
    far: { id: 'far', kind: 'wall', type: 'door', closed: true, p1: { x: 1000, y: 100 }, p2: { x: 1000, y: 300 } } as WallSegment,
  };
}

/** A readable pin in Ben's room, beside the goblin. */
const DEN: NotePin = { id: 'den', kind: 'pin', x: 950, y: 250, notePath: 'Notes/Den.md', readable: true } as NotePin;
/** Committed fog over the rat's corner of Ana's room, short of Ana. */
const FOG: FogOperation = { id: 'fog', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 280, y: 230, width: 60, height: 60 };

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

interface Step {
  readonly tokens?: Readonly<Record<string, Partial<TokenEntity>>>;
  readonly door?: 'none' | 'closed' | 'open';
}

/**
 * A dark scene of two floors, the ground shown: Ana and a rat (under fog) in one room, Ben and a goblin beyond the
 * wall, the goblin beside a readable pin; Cara and a bat upstairs. Ana, Ben and Cara see by darkvision.
 */
function scene({ tokens = {}, door = 'none' }: Step = {}): SceneState {
  const all: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300 }),
    cara: character('cara', 'Cara', { x: 400, y: 400, level: 'upper', vision: DARKVISION }),
    bat: character('bat', 'Bat', { x: 450, y: 420, level: 'upper' }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...all[id]!, ...change } as TokenEntity;
  const base = sceneState({ lighting: { enabled: true, ambient: 0 }, levels: LEVELS, viewedLevel: 'ground', background: 'maps/ground.webp' });
  return { ...base, objects: { ...base.objects, walls: walls(door), tokens: all, pins: { den: DEN }, fog: { fog: FOG } } };
}

type Adapter = 'renderer' | 'cpu';
/** How the share reaches the renderer: through the harness's parts, or through the GM's tab (`gmTabOf`). */
type Through = 'harness' | 'gmTab';

const NO_MARKS = { source: () => null, showPlayers: () => undefined, showPlayerDrags: () => undefined, showPlayerCursors: () => undefined, showPlayerStrokes: () => undefined };

/** A page's ids, numbered as they first reach it: the two runs draw random ids in their own order. */
function numbered(): (text: string) => string {
  const known = new Map<string, string>();
  return (text) => text.replace(/\b[0-9a-f]{24}\b/g, (id) => {
    if (!known.has(id)) known.set(id, `#${known.size}`);
    return known.get(id)!;
  });
}

/** One session's pages, step by step: what reached each page, and whether in one message to all. */
class Recording {
  readonly steps: Record<string, string[]>[] = [];
  private readonly read = new Map<string, number>();
  private readonly ids = new Map<string, (text: string) => string>();

  constructor(private readonly harness: ShareHarness) {}

  step(name: string): void {
    const heard: Record<string, string[]> = { step: [name] };
    for (const player of Object.keys(SHORT)) {
      let page;
      try {
        page = this.harness.pages.of(player);
      } catch {
        continue;
      }
      const ids = this.ids.get(player) ?? numbered();
      this.ids.set(player, ids);
      const from = this.read.get(player) ?? 0;
      heard[SHORT[player]!] = page.inbox.slice(from).map((body, index) => `${page.toAll[from + index] === true ? '*' : '>'} ${ids(JSON.stringify(body))}`);
      this.read.set(player, page.inbox.length);
    }
    this.steps.push(heard);
  }
}

/**
 * Plays the session with the ground floor read from `adapter`: the GM's renderer, which has drawn it, or the CPU,
 * while the renderer has not. Returns what each page heard and how often the renderer's players' frame was read.
 */
async function session(adapter: Adapter, through: Through = 'harness'): Promise<{ readonly steps: Record<string, string[]>[]; readonly rendererReads: number }> {
  const online = [ANA, BEN, CARA];
  const seats: SeatSource = { onlinePlayers: () => online, ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
  const start = scene();
  const harness = shareHarness(start, IMAGES, seats);
  harness.pages.join(...online);
  harness.settings = { ...PLAYER_SETTINGS, sharedVision: false };
  harness.drawn = adapter === 'renderer';
  let rendererReads = 0;
  const tab = { state: () => harness.state(), source: GENERIC_SOURCE, bounds: MAP };
  const perceive = (state: SceneState): void => {
    const seen = gmPerception(state, GENERIC_SOURCE, MAP);
    harness.perception = (tokenId) => {
      rendererReads += 1;
      return seen(tokenId);
    };
  };
  perceive(start);
  harness.layers = fakeLayers(tab);
  harness.basis = pictureBasisOf(fakeAtlasTab(tab).renderer);
  if (through === 'gmTab') {
    const fake = fakeAtlasTab({ ...tab, grid: () => ({ size: GRID_SIZE }), drawn: () => adapter === 'renderer' });
    const renderer = { ...fake.renderer, playerRollTokens: (mapPath: string, tokenIds?: readonly string[]) => (rendererReads += 1, fake.renderer.playerRollTokens(mapPath, tokenIds)) };
    const store = { getState: () => harness.state(), setState: () => undefined, subscribe: () => () => undefined };
    harness.gmTab = gmTabOf({ leaf: { view: fake.view } as unknown as WorkspaceLeaf, view: fake.view, store, renderer }, NO_MARKS);
  }
  harness.presented = 'ground';
  harness.share.start();
  await harness.set(start);
  await harness.advance(2000);
  const record = new Recording(harness);
  record.step('start');
  const set = async (name: string, step: Step): Promise<void> => {
    const next = scene(step);
    perceive(next);
    await harness.set(next);
    await harness.advance(2000);
    record.step(name);
  };
  const vision = async (name: string, on: boolean): Promise<void> => {
    harness.settings = { ...harness.settings, sharedVision: on };
    await harness.advance(2000);
    record.step(name);
  };
  const join = async (player: string): Promise<void> => {
    harness.pages.join(player);
    harness.share.resend(player);
    online.push(player);
    harness.share.ownersChanged();
    await harness.advance(2000);
    record.step(`${SHORT[player]} joins`);
  };
  const leave = async (player: string): Promise<void> => {
    harness.pages.leave(player);
    harness.share.playerLeft(player);
    online.splice(online.indexOf(player), 1);
    harness.share.ownersChanged();
    await harness.advance(2000);
    record.step(`${SHORT[player]} leaves`);
  };
  await set('the rat leaves the fog', { tokens: { rat: { x: 240 } } });
  await set('a door is put in the wall between', { tokens: { rat: { x: 240 } }, door: 'closed' });
  await set('the door between opens', { tokens: { rat: { x: 240 } }, door: 'open' });
  await vision('Shared vision on', true);
  await set('the goblin moves', { tokens: { rat: { x: 240 }, goblin: { x: 920 } }, door: 'open' });
  await vision('Shared vision off', false);
  await join(DAN);
  await leave(BEN);
  await set('the rat moves while Ben is away', { tokens: { rat: { x: 260 }, goblin: { x: 920 } }, door: 'open' });
  await join(BEN);
  await set('Ana takes the stairs', { tokens: { rat: { x: 260 }, goblin: { x: 920 }, ana: { level: 'upper', x: 420 } }, door: 'open' });
  await set('Ana comes back down', { tokens: { rat: { x: 260 }, goblin: { x: 920 }, ana: { level: 'ground', x: 200 } }, door: 'open' });
  harness.share.resend();
  await harness.advance(2000);
  record.step('the GM comes back to the table');
  harness.share.stop();
  return { steps: record.steps, rendererReads };
}

describe('the floor the GM looks at', () => {
  it.each<Through>(['harness', 'gmTab'])('shows every page the same, read from the GM\'s renderer or worked out on the CPU (renderer reached through the %s)', async (through) => {
    const renderer = await session('renderer', through);
    const cpu = await session('cpu', through);
    expect(renderer.rendererReads).toBeGreaterThan(0);
    expect(cpu.rendererReads).toBe(0);
    expect(cpu.steps).toEqual(renderer.steps);
  });
});
