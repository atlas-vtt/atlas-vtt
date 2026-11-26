import { describe, expect, it } from 'vitest';
import type { PictureBasis } from '../../../src/app/online/gm/eyesSight.ts';
import type { SeatSource } from '../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../src/app/online/gm/atlasView.ts';
import { stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { floorLevels } from '../../../src/app/dungeons/scene/createDungeonScene';
import { dungeonScene } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { heldForSight } from '../../../src/app/lighting/sightOnDrop';
import { playerDoorSight, playerPointSight } from '../../../src/app/pixi/lighting/playerLightingLayers';
import type { TokenEntity } from '../../../src/app/types';
import { perceptionOptions } from '../../../src/app/vision/perception';
import { SceneModelBuilder } from '../../../src/app/vision/sceneModel';
import { PerceptionMemo, tokenPerception } from '../../../src/app/vision/tokenPerception';
import { GENERIC_SOURCE, PLAYER_SETTINGS } from '../../unit/online/gm/gmLighting.ts';
import { pngOf } from '../../unit/online/gm/fakeTileCache.ts';
import { sceneState, shareHarness, token, type ShareHarness } from '../../unit/online/gm/shareHarness.ts';
import { timeBound } from '../../helpers/timeBound';

const PLAYERS = ['1', '2', '3', '4'].map((digit) => digit.repeat(20));
/** The floor each player's character stands on: two on the entry floor the GM looks at, one on each floor below. */
const PLAYER_FLOORS = [0, 0, 1, 2];
const MONSTERS_PER_FLOOR = 8;
/** A drag at 60 steps a second, for two seconds. */
const STEP_MS = 16;
const STEPS = 120;
const RUNS = 5;

const model = generateDungeon({ seed: 7, theme: 'fortress', tags: ['small'], floors: 3 });
const layout = mapLayout(model, 100, DEFAULT_VIEW);
const MAP = { width: layout.widthPx, height: layout.heightPx };
const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: 100 }, MAP, { unitType: 'feet', ruleDistance: 5 })!;
const LEVEL_IDS = parts.levelIds!;
const PATHS = LEVEL_IDS.map((_, floor) => `maps/floor-${floor}.png`);
const LEVELS = floorLevels(LEVEL_IDS, PATHS, stackOf(model));
const ROOMS = LEVEL_IDS.map((level) => parts.rooms.filter((room) => room.level === level).map(({ pin }) => pin));
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 60 }] };

const seats: SeatSource = {
  onlinePlayers: () => PLAYERS,
  ownerOf: (id) => (id.startsWith('pc') ? PLAYERS[Number(id.slice(2))] : undefined),
  claimOf: (_map, id) => (id.startsWith('pc') ? 'taken' : null),
};

/** The fortress lit dimly, its four characters in rooms of their own floors and monsters about every floor; at `step` the GM has dragged the first character that many steps on. */
function scene(step: number): SceneState {
  const tokens: Record<string, TokenEntity> = {};
  PLAYER_FLOORS.forEach((floor, index) => {
    const room = ROOMS[floor]![index % ROOMS[floor]!.length]!;
    const walked = index === 0 ? 4 * step : 0;
    tokens[`pc${index}`] = { ...token(`pc${index}`, { x: room.x + walked, y: room.y, level: LEVEL_IDS[floor], vision: DARKVISION }), kind: 'character', name: `PC ${index}` } as TokenEntity;
  });
  LEVEL_IDS.forEach((level, floor) => {
    for (let index = 0; index < MONSTERS_PER_FLOOR; index += 1) {
      const room = ROOMS[floor]![(index + 2) % ROOMS[floor]!.length]!;
      tokens[`m${floor}-${index}`] = { ...token(`m${floor}-${index}`, { x: room.x + 40 * (index % 3), y: room.y + 40 * Math.floor(index / 3), level }), kind: 'character', name: `Monster ${index}` } as TokenEntity;
    }
  });
  const state = sceneState({ levels: LEVELS, viewedLevel: LEVEL_IDS[0], background: PATHS[0], grid: parts.scene.grid, lighting: { enabled: true, ambient: 0.1 }, heldTokens: step > 0 ? { pc0: { x: 0, y: 0 } } : {} });
  return { ...state, objects: { ...state.objects, walls: parts.scene.walls ?? {}, lights: parts.scene.lights ?? {}, tokens } };
}

/** The GM's renderer of the floor its view shows: the party's perception, map layers and the basis players' own pictures are cut from, worked out whether or not a table runs. */
class GmRenderer {
  private readonly builder = new SceneModelBuilder();
  private readonly memo = new PerceptionMemo();

  draw(table: ShareHarness, state: SceneState): void {
    const { model: built } = this.builder.update(state, MAP, () => GENERIC_SOURCE.measurement(), () => GENERIC_SOURCE.rules());
    const tokens = { ...levelObjects(state).tokens };
    const perception = tokenPerception(built.sight, built.ambient, built.reaches, tokens, perceptionOptions(GENERIC_SOURCE.rules(), heldForSight(state)), this.memo);
    table.perception = perception;
    const lighting = { isEnabled: () => true, currentSight: () => built.sight, ambientLight: () => built.ambient, lightReaches: () => built.reaches };
    table.layers = {
      grid: () => null,
      rules: () => null,
      doorsSeen: (walls, fog) => playerDoorSight(lighting, { ...walls }, fog),
      pointsSeen: (points, fog) => playerPointSight(lighting, points, fog),
      sightParts: () => [built.sight, built.ambient, built.reaches],
      sensed: (all) => Object.entries(all).flatMap(([id, entry]) => (perception(id) === 'sensed' ? [{ x: entry.x, y: entry.y, size: 70 }] : [])),
    };
    const basis: PictureBasis = {
      lighting: () => ({ sight: built.sight, ambient: built.ambient, reaches: built.reaches }),
      frame: (lit) => lit,
      roofed: () => false,
      drawn: () => tokens,
      outline: (_id, entry) => ({ x: entry.x, y: entry.y, size: 70 }),
    };
    table.basis = basis;
  }
}

interface Drag {
  /** The share's processor time per drag step, in ms. */
  readonly cpu: number;
  /** The messages sent per second of the drag, to all or to one player. */
  readonly messages: number;
}

const cpuMs = (since: NodeJS.CpuUsage): number => {
  const { user, system } = process.cpuUsage(since);
  return (user + system) / 1000;
};

/**
 * One table where the GM drags the first character across its room: each step the store moves it,
 * then the GM's renderer follows and its sight changes, then the clock moves on to the next step.
 */
async function drag(sharedVision: boolean): Promise<Drag> {
  const images = new Map(PATHS.map((path) => [path, pngOf(MAP.width, MAP.height)]));
  const table = shareHarness(scene(0), images, seats);
  table.pages.join(...PLAYERS);
  table.presented = LEVEL_IDS[0];
  table.settings = { ...PLAYER_SETTINGS, sharedVision };
  const gm = new GmRenderer();
  gm.draw(table, scene(0));
  table.share.start();
  await table.set(scene(0));
  await table.advance(2000);
  const sentBefore = table.sent.length;
  let cpu = 0;
  for (let step = 1; step <= STEPS; step += 1) {
    const next = scene(step);
    let since = process.cpuUsage();
    await table.set(next);
    cpu += cpuMs(since);
    gm.draw(table, next);
    since = process.cpuUsage();
    table.sightChanged();
    await table.advance(STEP_MS);
    cpu += cpuMs(since);
  }
  const messages = (table.sent.length - sentBefore) / ((STEPS * STEP_MS) / 1000);
  table.share.stop();
  return { cpu: cpu / STEPS, messages };
}

const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * What Atlas Online costs the GM while it drags a character that sees: a generated three-floor fortress
 * lit dimly (its walls, doors, fires and wall lights), four players (two on the floor the GM looks at,
 * one on each floor below, each character seeing by darkvision), eight monsters a floor. The GM's renderer
 * works its model out outside the timed part, as Atlas draws it with or without a table; the timed part is
 * the share's reaction to the store's change, to the renderer's sight that follows it, and the paced
 * messages that fall due before the next step. Measured on 2026-11-26 beside the one-second polls this
 * replaced, both in one process: 1.05 against 1.13 ms a step with Shared vision, 1.47 against 1.63 ms with
 * the players' own pictures, at the token list's and the sight inputs' pace either way (95 and 47 messages a
 * second). Run alone (`npx vitest run --project perf <file>`).
 */
describe('a GM dragging a character on a lit three-floor dungeon with four players', () => {
  it('costs the GM under 4 ms of processor time a step, at no more than 120 messages a second', async () => {
    const cpu: Record<'shared' | 'own', number[]> = { shared: [], own: [] };
    const messages: Record<'shared' | 'own', number[]> = { shared: [], own: [] };
    for (let run = 0; run < RUNS; run += 1) {
      for (const mode of ['shared', 'own'] as const) {
        const result = await drag(mode === 'shared');
        cpu[mode].push(result.cpu);
        messages[mode].push(result.messages);
      }
    }
    const line = (mode: 'shared' | 'own'): string => `${mode} ${median(cpu[mode]).toFixed(3)} ms/step (${Math.min(...cpu[mode]).toFixed(3)}–${Math.max(...cpu[mode]).toFixed(3)}), ${median(messages[mode]).toFixed(1)} msg/s`;
    console.info(`[drag step] median of ${RUNS} runs of ${STEPS} steps: ${line('shared')}; ${line('own')}`);
    expect(median(cpu.own)).toBeLessThan(timeBound(4));
    expect(median(messages.own)).toBeLessThan(120);
  }, 300_000);
});
