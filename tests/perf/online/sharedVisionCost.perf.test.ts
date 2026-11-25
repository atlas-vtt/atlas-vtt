import { describe, expect, it } from 'vitest';
import type { PictureBasis } from '../../../src/app/online/gm/eyesSight.ts';
import type { MemoryPng, MemoryRaster } from '../../../src/app/online/gm/memory/memoryPorts.ts';
import type { ExploredShapes } from '../../../src/app/vision/exploredShapes';
import type { SeatSource } from '../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../src/app/online/gm/atlasView.ts';
import { TOKEN_INTERVAL_MS } from '../../../src/app/online/gm/TokenShare.ts';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { heldForSight } from '../../../src/app/lighting/sightOnDrop';
import type { LightSource } from '../../../src/app/types/lightingTypes';
import type { NotePin, TokenEntity } from '../../../src/app/types';
import { playerDoorSight, playerPointSight } from '../../../src/app/pixi/lighting/playerLightingLayers';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { perceptionOptions } from '../../../src/app/vision/perception';
import { SceneModelBuilder } from '../../../src/app/vision/sceneModel';
import { PerceptionMemo, tokenPerception } from '../../../src/app/vision/tokenPerception';
import { GENERIC_SOURCE, PLAYER_SETTINGS } from '../../unit/online/gm/gmLighting.ts';
import { sceneState, shareHarness, token, type ShareHarness } from '../../unit/online/gm/shareHarness.ts';
import { FakeMemoryStore } from '../../unit/online/gm/fakeMemory.ts';
import { pngOf } from '../../unit/online/gm/fakeTileCache.ts';
import { timeBound } from '../../helpers/timeBound';

const MAP = { width: 3000, height: 3000 };
const PLAYERS = Array.from({ length: 6 }, (_, index) => String(index + 1).repeat(20));
const MONSTERS = 34;
const STEPS = 30;
const RUNS = 5;

/** Eight walls across the map, every 600 px, each in 40 pieces with gaps sight passes through, one in eight a door: 320 walls. */
function walls(): Record<string, WallSegment> {
  const all: WallSegment[] = [];
  for (const at of [600, 1200, 1800, 2400]) {
    for (let piece = 0; piece < 40; piece += 1) {
      const from = piece * 75;
      const type = piece % 8 === 0 ? 'door' : 'solid';
      all.push({ id: `v${at}-${piece}`, kind: 'wall', type, p1: { x: at, y: from }, p2: { x: at, y: from + 60 } } as WallSegment);
      all.push({ id: `h${at}-${piece}`, kind: 'wall', type, p1: { x: from, y: at }, p2: { x: from + 60, y: at } } as WallSegment);
    }
  }
  return Object.fromEntries(all.map((wall) => [wall.id, wall]));
}

/** The walls stay the same record from move to move, as in Atlas, where only an edit makes a new one. */
const WALLS = walls();

/** Eight readable pins about the map. */
const PINS: Record<string, NotePin> = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`pin${index}`, {
  id: `pin${index}`, kind: 'pin', x: 200 + ((index * 733) % 2600), y: 200 + ((index * 389) % 2600), notePath: `Notes/Room ${index}.md`, readable: true,
} as NotePin]));

const LIGHTS: Record<string, LightSource> = Object.fromEntries([[300, 300], [1500, 900], [2700, 2100], [900, 2700]].map(([x, y], index) => [
  `light${index}`, { id: `light${index}`, kind: 'light', x, y, emission: { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'none' } } as LightSource,
]));

/** Six player characters seeing by darkvision in rooms of their own, 34 monsters about; `step` moves one monster and one character a step on. */
function scene(step: number): SceneState {
  const tokens: Record<string, TokenEntity> = {};
  PLAYERS.forEach((_, index) => {
    const id = `pc${index}`;
    const walked = 35 * Math.floor((step + PLAYERS.length - 1 - index) / PLAYERS.length);
    tokens[id] = { ...token(id, { x: 300 + (index % 3) * 1200 + walked, y: 300 + Math.floor(index / 3) * 1800, vision: { enabled: true, senses: [{ id: 'darkvision', range: 60 }] } }), kind: 'character', name: `PC ${index}` } as TokenEntity;
  });
  for (let index = 0; index < MONSTERS; index += 1) {
    const moved = index === step % MONSTERS ? 35 * (1 + Math.floor(step / MONSTERS)) : 0;
    tokens[`m${index}`] = { ...token(`m${index}`, { x: 150 + ((index * 431) % 2700) + moved, y: 150 + ((index * 977) % 2700) }), kind: 'character', name: `Monster ${index}` } as TokenEntity;
  }
  const state = sceneState({ background: 'maps/cave.png', lighting: { enabled: true, ambient: 0.1 } });
  return { ...state, objects: { ...state.objects, walls: WALLS, lights: LIGHTS, pins: PINS, tokens } };
}

const seats: SeatSource = {
  onlinePlayers: () => PLAYERS,
  ownerOf: (id) => (id.startsWith('pc') ? PLAYERS[Number(id.slice(2))] : undefined),
  claimOf: (_map, id) => (id.startsWith('pc') ? 'taken' : null),
};

/**
 * The GM's renderer, which works its model out whether or not a table runs: the party's perception
 * for the players' frame and its map layers, and the same model as the basis players' own pictures
 * are cut from.
 */
class GmRenderer {
  private readonly builder = new SceneModelBuilder();
  private readonly memo = new PerceptionMemo();

  draw(table: ShareHarness, state: SceneState): void {
    const { model } = this.builder.update(state, MAP, () => GENERIC_SOURCE.measurement(), () => GENERIC_SOURCE.rules());
    const tokens = { ...levelObjects(state).tokens };
    const perception = tokenPerception(model.sight, model.ambient, model.reaches, tokens, perceptionOptions(GENERIC_SOURCE.rules(), heldForSight(state)), this.memo);
    table.perception = perception;
    const lighting = { isEnabled: () => true, currentSight: () => model.sight, ambientLight: () => model.ambient, lightReaches: () => model.reaches };
    table.layers = {
      grid: () => null,
      rules: () => null,
      doorsSeen: (walls, fog) => playerDoorSight(lighting, { ...walls }, fog),
      pointsSeen: (points, fog) => playerPointSight(lighting, points, fog),
      sightParts: () => [model.sight, model.ambient, model.reaches],
      sensed: (all) => Object.entries(all).flatMap(([id, entry]) => (perception(id) === 'sensed' ? [{ x: entry.x, y: entry.y, size: 70 }] : [])),
    };
    const basis: PictureBasis = {
      lighting: () => ({ sight: model.sight, ambient: model.ambient, reaches: model.reaches }),
      frame: (lit) => lit,
      roofed: () => false,
      drawn: () => tokens,
      outline: (_id, entry) => ({ x: entry.x, y: entry.y, size: 70 }),
    };
    table.basis = basis;
  }
}

/**
 * Stands in for a player's memory texture, whose stamps and read-backs run on the GM's graphics card (see
 * `playerMemoryRaster.gpu.test.ts`): it counts the stamps, takes the outline each would draw, and reads back
 * a PNG that changes with every stamp, so the players are sent it.
 */
class CountingRaster implements MemoryRaster {
  static stamps = 0;
  private count = 0;

  add(shapes: ExploredShapes): void {
    this.count += shapes.polygons.length > 0 ? 1 : 0;
    CountingRaster.stamps += 1;
  }

  merge(): Promise<void> {
    return Promise.resolve();
  }

  replace(): Promise<void> {
    return Promise.resolve();
  }

  encode(): Promise<MemoryPng | null> {
    return Promise.resolve(Uint8Array.of(this.count & 255, this.count >> 8));
  }

  destroy(): void {
    this.count = 0;
  }
}

/** How players see: the party's picture (Shared vision on), their own, or their own with an explored memory each. */
type Mode = 'shared' | 'own' | 'own memory';

/** Who was sent which kinds of message: to each player alone, or to all (''). */
function addressees(table: ShareHarness): Map<string, Set<string>> {
  const kinds = new Map<string, Set<string>>();
  for (const { body, to } of table.sent) kinds.set(to ?? '', new Set([...(kinds.get(to ?? '') ?? []), body.t]));
  return kinds;
}

/** One table playing STEPS moves, each followed by one tick of the shares' pace; the share's work per tick, in ms, and who was sent what. */
async function play(mode: Mode): Promise<{ readonly ticks: number[]; readonly sent: Map<string, Set<string>> }> {
  const memory = mode === 'own memory' ? { rasters: { create: (): MemoryRaster => new CountingRaster() }, store: new FakeMemoryStore(), images: { coverage: () => Promise.resolve(null), png: () => Promise.resolve(new Uint8Array(0)) } } : undefined;
  const table = shareHarness(scene(0), new Map([['maps/cave.png', pngOf(MAP.width, MAP.height)]]), seats, undefined, undefined, memory);
  const gm = new GmRenderer();
  table.settings = { ...PLAYER_SETTINGS, sharedVision: mode === 'shared' };
  gm.draw(table, scene(0));
  table.share.start();
  await table.set(scene(0));
  await table.advance(1000);
  const ticks: number[] = [];
  for (let step = 1; step <= STEPS; step += 1) {
    const next = scene(step);
    gm.draw(table, next);
    const start = performance.now();
    await table.set(next);
    await table.advance(TOKEN_INTERVAL_MS);
    ticks.push(performance.now() - start);
  }
  table.share.stop();
  return { ticks, sent: addressees(table) };
}

const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * What Atlas Online costs the GM per tick (one store change, then the 66 ms pace of the token list,
 * inputs and layers) on a floor of six players, 40 tokens, 320 walls with 40 doors, eight readable pins
 * and four lights, a monster and a character moving each tick: one picture with Shared vision on, the
 * party's and six of the players' own with it off, and those with each player's own explored memory
 * stamped at its pace (`MEMORY_STAMP_MS`: the main thread's part of it; the stamps and read-backs on the
 * graphics card are measured in `playerMemoryRaster.gpu.test.ts`). The GM's renderer's own model is
 * worked out outside the timed part, as Atlas draws it with or without a table. Measured on 2026-11-25:
 * 0.66 ms a tick shared, 2.1 ms with own pictures, with or without their memories: only a player whose own
 * sight changed is stamped, and that sight is cut from the party's without tracing.
 * Run alone (`npm run test:perf`).
 */
describe('six players\' own pictures', () => {
  it('cost the GM under 6 ms a tick, their own explored memories included', async () => {
    const ticks: Record<Mode, number[]> = { shared: [], own: [], 'own memory': [] };
    for (let run = 0; run < RUNS; run += 1) {
      const on = await play('shared');
      const off = await play('own');
      CountingRaster.stamps = 0;
      const remembered = await play('own memory');
      // The work timed is the work meant: one picture to all, else each player's own lists, doors and pins, and their memory.
      for (const player of PLAYERS) expect([...(on.sent.get(player) ?? [])]).toEqual(['mine']);
      for (const player of PLAYERS) expect([...(off.sent.get(player) ?? [])]).toEqual(expect.arrayContaining(['tokens', 'sight', 'doors', 'pins', 'mine']));
      for (const player of PLAYERS) expect([...(remembered.sent.get(player) ?? [])]).toEqual(expect.arrayContaining(['explored']));
      expect(CountingRaster.stamps).toBeGreaterThan(STEPS / 2);
      ticks.shared.push(median(on.ticks));
      ticks.own.push(median(off.ticks));
      ticks['own memory'].push(median(remembered.ticks));
    }
    const range = (values: number[]): string => `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;
    const line = (mode: Mode): string => `${mode} ${median(ticks[mode]).toFixed(2)} ms (${range(ticks[mode])})`;
    console.info(`[shared vision] per tick, median of ${RUNS} runs of ${STEPS}: ${line('shared')}, ${line('own')}, ${line('own memory')}`);
    expect(median(ticks['own memory'])).toBeLessThan(timeBound(6));
  }, 300_000);
});
