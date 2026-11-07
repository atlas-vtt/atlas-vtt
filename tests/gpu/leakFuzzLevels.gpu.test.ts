/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { Matrix, Texture } from 'pixi.js';
import { NO_STRETCH } from '../../src/app/grid/mapStretch';
import { artCells } from '../../src/app/levels/artRaster';
import { describe, expect, it, vi } from 'vitest';
import { showsMap } from '../../src/app/gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../src/app/gameSystems/senses/generic';
import { belowQuality, LIGHTING_QUALITY, type LightingQuality } from '../../src/app/lighting/lightingQuality';
import { wallBand, worldTexel } from '../../src/app/lighting/lightingConstants';
import { levelObjects, levelObjectsOn } from '../../src/app/levels/levelObjects';
import { levelStack, shownAt, stackGrid, VIEWED, VOID, type LevelStack } from '../../src/app/levels/levelStack';
import { levelSurfaceList } from '../../src/app/levels/levelSurfaces';
import { stampClip } from '../../src/app/levels/stackClip';
import { distToSeg } from '../../src/app/lighting/segments';
import { exploredGrid } from '../../src/app/pixi/lighting/ExploredTexture';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { rulesLookup } from '../../src/app/services/mapRules';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource, LightZone } from '../../src/app/types/lightingTypes';
import type { LevelSurface } from '../../src/app/types/sceneLevelTypes';
import { lightLevelAt } from '../../src/app/vision/lightLevels';
import { perceive, regionContains } from '../../src/app/vision/perception';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import { litPolygons, type Sight } from '../../src/app/vision/sight';
import { belowTokenPerception, sightBelow, type BelowSight } from '../../src/app/vision/throughSight';
import type { MapBounds } from '../../src/app/vision/visibility';
import { fuzzRooms, insidePolygon, rng, type FuzzRoom, type P } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { fakeLevelArt, LEVELS, openLevelsView, paintedTexture, worldOf, type LevelsView } from '../helpers/levelsView';
import { ART_CLEAN, fuzzArt, type ArtReport } from './levelsArtFuzz';
import { belowArt, cyan, inPlainView, inside, light, lit, magenta, maskAlpha, nearAllowed, surface, toEdges, token, wallsOn } from '../helpers/levelsFuzz';

vi.mock('events', async () => import('eventemitter3'));

const PANE = 320;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
/** Trials of the cases beside the main one: a third of its, so the long fuzz reaches them too. */
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));
/** Where the openings lie: inside the upper room, across and along its walls, over the rooms below, at the map's edge; and a floor alone. */
const KINDS = ['inside', 'wall', 'below', 'edge', 'floor'] as const;
type Kind = (typeof KINDS)[number];

/** Cyan: the art of every token below, which nothing else in the picture has. */
const CYAN = paintedTexture(8, 8, () => [20, 230, 230]);

interface Report {
  rooms: number;
  kinds: Record<Kind, number>;
  /** Pixels where the stack shows the viewed level, and those that differ from the scene without openings. */
  viewed: number;
  viewedChanged: number;
  /** Pixels where it shows nothing, and those that are not black. */
  voids: number;
  voidsLit: number;
  /** Pixels where it shows the level below, those with its hue, and those of them no line of sight reaches. */
  below: number;
  belowHue: number;
  leaks: number;
  /** Pixels below the rule counts seen by sight in the light, and those of them that show the level below. */
  seenLit: number;
  seenShown: number;
  /** Tokens below the players perceive and those they do not; perceptions the view and the rule disagree on; pixels of unseen tokens that show. */
  tokensSeen: number;
  tokensUnseen: number;
  tokenDisagreements: number;
  tokenLeaks: number;
  /** Seen tokens below whose middle is in the picture, lit and seen by sight, and those of them that show there. */
  tokensLit: number;
  tokensShown: number;
  /** Floors without an opening: their frames differ from the scene without them, and tokens below are perceived. */
  floors: number;
  floorChanged: number;
  floorTokens: number;
  /** Memories below saved: texels remembered, and those outside the texels the openings showed. */
  memories: number;
  remembered: number;
  rememberedOutside: number;
  /** The memory drawn back on its own level: pixels that show it, and those far from what the openings showed. */
  restored: number;
  restoredOutside: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  map?: number;
  resolution?: number;
  quality?: LightingQuality;
  /** The level below's map, where it is smaller than the view's. */
  belowRect?: MapBounds;
  /** The rule reads openings half as large as the picture draws them (the negative control). */
  shrunkRule?: boolean;
}

/** An opening of `kind` for the upper room `room`. */
function openingOf(kind: Kind, room: FuzzRoom, below: FuzzRoom, map: number, rand: () => number): P[] {
  const [cx, cy] = room.centre;
  if (kind === 'inside' || kind === 'floor') {
    const shrink = 0.25 + rand() * 0.5;
    return room.outline.map(([x, y]): P => [cx + (x - cx) * shrink, cy + (y - cy) * shrink]);
  }
  if (kind === 'wall') {
    const i = Math.floor(rand() * room.roomWallCount);
    const wall = room.walls[i]!;
    const [ax, ay, bx, by] = [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
    const along = length * (0.3 + rand() * 0.3);
    const across = 15 + rand() * 60;
    const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
    return [[mx - ux * along - uy * across, my - uy * along + ux * across], [mx + ux * along - uy * across, my + uy * along + ux * across],
      [mx + ux * along + uy * across, my + uy * along - ux * across], [mx - ux * along + uy * across, my - uy * along - ux * across]];
  }
  if (kind === 'below') {
    const [bx, by] = below.centre;
    const half = 150 + rand() * 200;
    return [[bx - half, by - half], [bx + half, by - half], [bx + half, by + half], [bx - half, by + half]];
  }
  const reach = 200 + rand() * 300;
  const half = 150 + rand() * 200;
  return rand() < 0.5
    ? [[0, cy - half], [reach, cy - half], [reach, cy + half], [0, cy + half]]
    : [[cx - half, map], [cx - half, map - reach], [cx + half, map - reach], [cx + half, map]];
}

/**
 * Two floors of fuzz rooms, the view on the upper one looking down through openings into the
 * ground floor, rendered through the real view (`LightingController`, its engine and its levels
 * below) as the players' frame. What it holds:
 * 1. where the stack shows the viewed level the picture is the scene's without openings, pixel for pixel;
 * 2. no pixel shows the level below's hue where no line of sight of the view (or the level's own tokens) reaches, beyond
 *    1.5 screen px of filtering at the sight's edges and none at the stack's;
 * 3. where the rule counts the level below seen by sight in the light, it shows;
 * 4. a floor without an opening changes nothing, and no token below is perceived;
 * 5. a token below shows only where the rule perceives it, and the view perceives the tokens below as the rule does;
 * 6. the level below's memory, saved, holds nothing outside the texels the openings showed (`stampClip`), and drawn
 *    back on its own level shows nothing far from them.
 * Where the stack shows nothing, the picture is black.
 */
async function fuzz({ seed, trials, map = 2048, resolution = 1, quality, belowRect, shrunkRule = false }: FuzzOptions): Promise<Report> {
  const view: LevelsView = await openLevelsView({ map, pane: PANE, resolution, below: belowArt(map), tokenArt: CYAN, ...(quality && { quality }), ...(belowRect && { belowRect }) });
  const device = PANE * resolution;
  const belowBounds = belowRect ?? { width: map, height: map };
  const bounds = { width: map, height: map };
  const report: Report = {
    rooms: 0, kinds: { inside: 0, wall: 0, below: 0, edge: 0, floor: 0 }, viewed: 0, viewedChanged: 0, voids: 0, voidsLit: 0, below: 0, belowHue: 0, leaks: 0,
    seenLit: 0, seenShown: 0, tokensSeen: 0, tokensUnseen: 0, tokenDisagreements: 0, tokenLeaks: 0, tokensLit: 0, tokensShown: 0, floors: 0, floorChanged: 0, floorTokens: 0,
    memories: 0, remembered: 0, rememberedOutside: 0, restored: 0, restoredOutside: 0,
  };
  try {
    const rand = rng(seed + 17);
    const uppers = fuzzRooms(seed, trials);
    const lowers = fuzzRooms(seed + 1009, trials);
    for (let n = 0; n < trials; n++) {
      const room = uppers[n]!;
      const lower = lowers[n]!;
      const kind = KINDS[n % KINDS.length]!;
      // The scout stands in the room an inside opening lies in: what it sees through it is remembered.
      const memoryTrial = kind === 'inside';
      report.rooms++;
      report.kinds[kind]++;
      const opening = openingOf(kind, room, lower, map, rand);
      const [ox, oy] = [opening.reduce((sum, p) => sum + p[0], 0) / opening.length, opening.reduce((sum, p) => sum + p[1], 0) / opening.length];
      // A pit in the ground floor under some openings: nothing lies below it, a chasm.
      const pitHalf = 30 + rand() * 50;
      const pit: LevelSurface = { ...surface('pit', [[ox - pitHalf, oy - pitHalf], [ox + pitHalf, oy - pitHalf], [ox + pitHalf, oy + pitHalf], [ox - pitHalf, oy + pitHalf]], true), level: 'ground' };
      const surfaces: Record<string, LevelSurface> = kind === 'floor'
        ? { floor: surface('floor', opening, false) }
        : {
          hole: surface('hole', opening, true),
          ...(n % 5 === 4 && { plank: surface('plank', opening.slice(0, 3), false) }),
          ...(n % 4 === 3 && { pit }),
        };
      const ambient = [0, 0.4, 1][n % 3]!;
      const lights: Record<string, LightSource> = {};
      room.lights.forEach((p, i) => { lights[`v${i}`] = light(`v${i}`, p, 'upper', 15 + rand() * 25); });
      lower.lights.forEach((p, i) => {
        const beam = n % 3 === 0 ? { angle: 30 + rand() * 270 } : {};
        lights[`b${i}`] = light(`b${i}`, p, 'ground', 15 + rand() * 25, beam, beam.angle ? rand() * 360 : undefined);
      });
      if (n % 4 === 2) lights.dark = light('dark', lower.lights[lower.lights.length - 1]!, 'ground', 8 + rand() * 20, { darkness: true });
      const zones: Record<string, LightZone> = n % 5 === 3
        ? { zone: { id: 'zone', kind: 'light-zone', levels: ['ground'], ambient: n % 2 ? 1 : 0.1, polygon: lower.outline.map(([x, y]) => ({ x: x * 0.9 + lower.centre[0] * 0.1, y: y * 0.9 + lower.centre[1] * 0.1 })) } }
        : {};
      const darkvision = n % 2 === 0 ? { senses: [{ id: 'darkvision', range: 60 }] } : {};
      const tokens: Record<string, TokenEntity> = { scout: token('scout', room.lights[0]!, 'upper', { vision: { enabled: true, ...darkvision } }) };
      const inOpening = (): P | null => inside(opening, rand);
      for (let i = 0; i < 4; i++) {
        const at = i < 2 ? inOpening() : inside(lower.outline, rand);
        if (at) tokens[`m${i}`] = token(`m${i}`, at, 'ground', i === 1 ? { isHidden: true } : {});
      }
      // One token below where the scout looks down at it, in the light of a lamp of its own level.
      const watched = kind === 'floor' ? null : inPlainView(room.lights[0]!, opening, room.walls, rand);
      if (watched) {
        tokens.watched = token('watched', watched, 'ground');
        lights.lamp = light('lamp', watched, 'ground', 12);
      }
      if (!memoryTrial && n % 4 === 2) {
        const at = inOpening();
        if (at) tokens.ally = token('ally', at, 'ground', { vision: { enabled: true } });
      }
      const { store } = view;
      // Each room is a scene of its own: what the last one remembered is saved into it, never into this one.
      view.controller.renderer.beforeMapUnload();
      store.getState().setMapPath(`maps/levels-${seed}-${n}.atlasmap`);
      const objects = {
        ...store.getState().objects,
        tokens, walls: { ...wallsOn(room, 'v', 'upper'), ...wallsOn(lower, 'b', 'ground') }, lights, lightZones: zones,
      };
      store.setState({ mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper', exploredMask: null, exploredMasks: undefined, objects: { ...objects, levelSurfaces: {} } });
      store.getState().setSceneLighting({ enabled: true, ambient });
      await view.settle();
      const scale = 0.25 + rand() * 1.25;
      const x = PANE / 2 - ox * scale + (rand() - 0.5) * 120;
      const y = PANE / 2 - oy * scale + (rand() - 0.5) * 120;
      store.setState({ objects: { ...objects, levelSurfaces: surfaces } });
      await view.settle();
      const frame = await view.settledPlayerFrame(scale, x, y);
      // The same scene without its openings, for what the viewed level shows.
      store.setState({ objects: { ...objects, levelSurfaces: {} } });
      const reference = await view.settledPlayerFrame(scale, x, y);
      store.setState({ objects: { ...objects, levelSurfaces: surfaces } });
      await view.settle();
      // The rule, worked out here from the same scene.
      const state = store.getState();
      const measurement = () => mapMeasurementSettings(rulesLookup(view.obsApp), state);
      const ruleSurfaces = shrunkRule ? levelSurfaceList(levelObjects(state).levelSurfaces).map((entry) => ({ ...entry, polygon: entry.polygon.map((p) => ({ x: ox + (p.x - ox) * 0.5, y: oy + (p.y - oy) * 0.5 })) })) : levelSurfaceList(levelObjects(state).levelSurfaces);
      const grid = stackGrid(bounds);
      const groundArt = artCells(fakeLevelArt({ texture: Texture.EMPTY, ...belowBounds }), NO_STRETCH, true, grid);
      const stack: LevelStack = levelStack({ id: 'upper', surfaces: ruleSurfaces }, [{ id: 'ground', surfaces: levelSurfaceList(levelObjectsOn(state, 'ground').levelSurfaces), art: groundArt }], ['ground'], grid);
      const viewed: Sight = view.controller.renderer.currentSight();
      const seen = { ...state, viewedLevel: 'ground' };
      const { model } = new SceneModelBuilder().update(seen, belowBounds, measurement);
      const below: BelowSight = { stack, index: 1, sight: sightBelow(viewed, model.sight), ambient: model.ambient, reaches: model.reaches };
      const mapRegions = below.sight.regions.filter((region) => showsMap(region.sense));
      const spots = new SceneSpots().update(model, seen, measurement).map((spot) => spot.polygon);
      const sightEdges = [...mapRegions.flatMap((region) => (region.polygon ? [region.polygon] : [])), ...spots];
      const lightEdges = [...sightEdges, ...model.reaches.flatMap(litPolygons), ...Object.values(zones).map((zone) => zone.polygon)];
      // The level below is lit a tier down (`belowQuality`): its walls' faces are as wide as its own texels make them.
      const texel = worldTexel(belowBounds, belowQuality(quality ?? LIGHTING_QUALITY.high).maxTexels);
      const lowerWalls = Object.values(wallsOn(lower, 'b', 'ground'));
      const filter = 1.5 / scale + 0.01;
      const shown = (p: { x: number; y: number }): boolean => below.sight.all || mapRegions.some((region) => regionContains(region, p)) || spots.some((polygon) => insidePolygon([p.x, p.y], polygon.map((q): P => [q.x, q.y])));
      const normal: Sight = { all: below.sight.all, regions: below.sight.regions.filter((region) => region.sense === NORMAL_SIGHT) };
      // The players' badges on the viewed level's doors stand over everything, the openings too.
      const doors = room.walls.filter((wall) => wall.type === 'door').map((wall) => ({ x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 }));
      const onBadge = (p: { x: number; y: number }): boolean => doors.some((door) => Math.hypot(door.x - p.x, door.y - p.y) < 20 / scale);

      // Tokens below: the view's perception is the rule's, and an unseen one shows nowhere.
      const tokensBelow = levelObjectsOn(state, 'ground').tokens;
      const rule = belowTokenPerception(below, tokensBelow, { viewed: undefined, below: undefined });
      const theView = view.controller.renderer.belowTokenPerception?.();
      const unseenTokens: TokenEntity[] = [];
      const seenTokens: TokenEntity[] = [];
      for (const entry of Object.values(tokensBelow)) {
        const perceived = rule(entry.id);
        if (!shrunkRule && theView && theView(entry.id) !== perceived) report.tokenDisagreements++;
        if (perceived === 'seen') {
          report.tokensSeen++;
          seenTokens.push(entry);
        } else {
          report.tokensUnseen++;
          unseenTokens.push(entry);
        }
        if (kind === 'floor' && perceived !== 'unseen') report.floorTokens++;
      }

      if (kind === 'floor') report.floors++;
      // A seen token below shows at its middle where sight sees it in the light.
      for (const entry of seenTokens) {
        const at = new Matrix(scale, 0, 0, scale, x, y).apply({ x: entry.x, y: entry.y });
        const [sx, sy] = [Math.floor(at.x * resolution), Math.floor(at.y * resolution)];
        if (sx < 0 || sy < 0 || sx >= device || sy >= device || onBadge(entry)) continue;
        const level = lightLevelAt(entry, below.ambient, below.reaches);
        if ((level !== 'bright' && level !== 'dim') || perceive(entry, normal, level) !== 'seen' || toEdges(entry, lightEdges) < 40) continue;
        report.tokensLit++;
        const o = (sy * device + sx) * 4;
        if (frame[o + 1]! + frame[o + 2]! > 2 * frame[o]! + 60) report.tokensShown++;
      }
      const edgeSlack = 0.01 / (scale * resolution * stack.grid.texel);
      for (let sy = 0; sy < device; sy++) {
        for (let sx = 0; sx < device; sx++) {
          const p = worldOf(sx, sy, resolution, scale, x, y);
          if (p.x < 0 || p.y < 0 || p.x >= map || p.y >= map) continue;
          const o = (sy * device + sx) * 4;
          // A pixel whose middle lies on a texel's edge may read either texel: within a hundredth of a
          // device pixel, which is finer than the rasteriser places the quad the composite runs on.
          const cx = p.x / stack.grid.texel;
          const cy = p.y / stack.grid.texel;
          if (Math.abs(cx - Math.round(cx)) < edgeSlack || Math.abs(cy - Math.round(cy)) < edgeSlack) continue;
          const differs = frame[o] !== reference[o] || frame[o + 1] !== reference[o + 1] || frame[o + 2] !== reference[o + 2];
          if (kind === 'floor' && differs) report.floorChanged++;
          const k = shownAt(stack, p);
          if (k === VIEWED) {
            report.viewed++;
            if (differs) report.viewedChanged++;
          } else if (k === VOID) {
            report.voids++;
            if (lit(frame, o)) report.voidsLit++;
          } else {
            report.below++;
            const hue = (magenta(frame, o) || cyan(frame, o)) && !onBadge(p);
            if (hue) report.belowHue++;
            if (hue && !shown(p) && toEdges(p, sightEdges) > filter) report.leaks++;
            // Seen by sight in the light, away from every edge where the picture fades or a wall's face takes another light.
            const level = lightLevelAt(p, below.ambient, below.reaches);
            const clear = toEdges(p, lightEdges) > filter + 40 && lowerWalls.every((wall) => distToSeg(p.x, p.y, [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y]) > wallBand(texel) + filter);
            if (clear && (level === 'bright' || level === 'dim') && perceive(p, normal, level) === 'seen' && Object.values(tokensBelow).every((entry) => Math.hypot(entry.x - p.x, entry.y - p.y) > 40)) {
              report.seenLit++;
              if (magenta(frame, o)) report.seenShown++;
            }
          }
          // A token's art reaches 31 px from its centre; one seen beside it may show there.
          const near = (entry: TokenEntity): boolean => Math.hypot(entry.x - p.x, entry.y - p.y) < 33;
          if (cyan(frame, o) && !onBadge(p) && unseenTokens.some(near) && !seenTokens.some(near)) report.tokenLeaks++;
        }
      }

      if (memoryTrial && !shrunkRule) {
        // What the openings showed of the ground floor is saved into its memory, which is then its own.
        view.controller.renderer.beforeMapUnload();
        await view.settle();
        // The ground floor is the scene's first level: its memory is the scene's own.
        const mask = view.store.getState().exploredMask;
        const grid = exploredGrid(belowBounds);
        const clip = stampClip(stack, 1, { ...grid, mapWidth: belowBounds.width, mapHeight: belowBounds.height });
        if (mask) {
          report.memories++;
          const saved = await maskAlpha(mask);
          for (let my = 0; my < saved.height; my++) {
            for (let mx = 0; mx < saved.width; mx++) {
              if (!saved.alpha[my * saved.width + mx]) continue;
              report.remembered++;
              if (!nearAllowed(clip, mx, my, 0)) report.rememberedOutside++;
            }
          }
          store.getState().setViewedLevel('ground');
          await view.settle();
          await view.settle();
          const restored = view.playerFrame(scale, x, y);
          for (let sy = 0; sy < device; sy++) {
            for (let sx = 0; sx < device; sx++) {
              const p = worldOf(sx, sy, resolution, scale, x, y);
              if (p.x < 0 || p.y < 0 || p.x >= belowBounds.width || p.y >= belowBounds.height) continue;
              const o = (sy * device + sx) * 4;
              if (!lit(restored, o)) continue;
              report.restored++;
              // The memory is read blurred over two of its texels, and bilinearly.
              const mx = (p.x / belowBounds.width) * grid.columns - 0.5;
              const my = (p.y / belowBounds.height) * grid.rows - 0.5;
              if (!nearAllowed(clip, mx, my, 3.5)) report.restoredOutside++;
            }
          }
          store.getState().setViewedLevel('upper');
        }
      }
    }
    return report;
  } finally {
    view.dispose();
  }
}

/** What every run holds. */
const CLEAN = { viewedChanged: 0, voidsLit: 0, leaks: 0, tokenDisagreements: 0, tokenLeaks: 0, floorChanged: 0, floorTokens: 0, rememberedOutside: 0, restoredOutside: 0 };

function expectHolds(report: Report, trials: number): void {
  expect(report.rooms).toBe(trials);
  expect(report.viewed).toBeGreaterThan(trials * 1000);
  expect(report.below).toBeGreaterThan(trials * 1000);
  expect(report.belowHue).toBeGreaterThan(trials * 100);
  expect(report.seenLit).toBeGreaterThan(trials * 20);
  expect(report.seenShown).toBeGreaterThan(report.seenLit * 0.98);
  expect(report.tokensSeen).toBeGreaterThan(0);
  expect(report.tokensUnseen).toBeGreaterThan(0);
  expect(report.tokensShown).toBe(report.tokensLit);
  expect(report).toMatchObject(CLEAN);
}

describe('leak fuzz: looking down through openings', () => {
  it('shows the level below only where the stack and the view\'s sight say, remembers only what the openings showed, and changes nothing else', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 3, trials: TRIALS });
    console.info(`leak fuzz (levels): ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expectHolds(report, TRIALS);
    expect(report.voids).toBeGreaterThan(0);
    // Nearly every trial with an opening in the scout's room leaves the level below a memory.
    expect(report.memories).toBeGreaterThanOrEqual(report.kinds.inside * 0.8);
    expect(report.remembered).toBeGreaterThan(TRIALS * 100);
    expect(report.restored).toBeGreaterThan(TRIALS * 100);
    expect(report.tokensLit).toBeGreaterThan(0);
  });

  it.each([[8192, 11], [9000, 13]])('holds on a map of %i px', { timeout: 3_600_000 }, async (side, seed) => {
    const report = await fuzz({ seed, trials: SIDE_TRIALS, map: side });
    console.info(`leak fuzz (levels, ${side} px map): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expectHolds(report, SIDE_TRIALS);
  });

  it.each(['balanced', 'saver'] as const)('holds at the %s lighting quality', { timeout: 3_600_000 }, async (level) => {
    const report = await fuzz({ seed: 21, trials: SIDE_TRIALS, map: 8192, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (levels, ${level}): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expectHolds(report, SIDE_TRIALS);
  });

  it('holds with a level below smaller than the view\'s, which shows nothing beyond its own map', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 29, trials: SIDE_TRIALS, belowRect: { width: 1300, height: 1500 } });
    console.info(`leak fuzz (levels, smaller level below): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expectHolds(report, SIDE_TRIALS);
    expect(report.voids).toBeGreaterThan(SIDE_TRIALS * 100);
  });

  it('holds at renderer resolution 2', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: SIDE_TRIALS, resolution: 2 });
    console.info(`leak fuzz (levels, resolution 2): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expectHolds(report, SIDE_TRIALS);
  });

  it('finds the level below where the rule reads smaller openings than the picture draws (the checks can fail)', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 3, trials: 10, shrunkRule: true });
    console.info(`negative control (levels): ${JSON.stringify(report)}`);
    expect(report.viewedChanged).toBeGreaterThan(100);
  });
});

describe('leak fuzz: looking down through the transparent parts of a level\'s map, two levels deep', () => {
  function expectArtHolds(report: ArtReport, trials: number): void {
    expect(report.rooms).toBe(trials);
    expect(report.viewed).toBeGreaterThan(trials * 1000);
    expect(report.below[0] + report.below[1]).toBeGreaterThan(trials * 1000);
    expect(report.belowHue[0]).toBeGreaterThan(trials * 50);
    expect(report.belowHue[1]).toBeGreaterThan(trials * 20);
    expect(report.seenLit).toBeGreaterThan(trials * 20);
    expect(report.seenShown).toBeGreaterThan(report.seenLit * 0.98);
    expect(report.tokensSeen).toBeGreaterThan(0);
    expect(report.tokensUnseen).toBeGreaterThan(0);
    expect(report).toMatchObject(ART_CLEAN);
  }

  it.each(['frame', 'tower', 'turned'] as const)('shows each level below only through transparent art and where the view\'s sight says, on levels laid out as %s', { timeout: 3_600_000 }, async (kind) => {
    const trials = kind === 'frame' ? TRIALS : SIDE_TRIALS;
    const report = await fuzzArt({ seed: 41 + kind.length, trials, case: kind });
    console.info(`leak fuzz (levels, art, ${kind}): ${JSON.stringify({ trials, ...report })}`);
    expectArtHolds(report, trials);
    if (kind === 'frame') {
      expect(report.opaque).toBeGreaterThan(0);
      expect(report.memories).toBeGreaterThan(0);
      expect(report.remembered).toBeGreaterThan(trials * 50);
    }
  });

  it('holds where the tile worker reads a resized overview of a map larger than it', { timeout: 3_600_000 }, async () => {
    const report = await fuzzArt({ seed: 53, trials: SIDE_TRIALS, case: 'large' });
    console.info(`leak fuzz (levels, art, large image): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expectArtHolds(report, SIDE_TRIALS);
  });

  it.each([['balanced', 8192], ['saver', 9000]] as const)('holds at the %s lighting quality on a map of %i px', { timeout: 3_600_000 }, async (level, side) => {
    const report = await fuzzArt({ seed: 59, trials: SIDE_TRIALS, case: 'frame', map: side, quality: LIGHTING_QUALITY[level] });
    console.info(`leak fuzz (levels, art, ${level}, ${side} px): ${JSON.stringify({ trials: SIDE_TRIALS, ...report })}`);
    expectArtHolds(report, SIDE_TRIALS);
  });

  it('finds a level below under art the view reads as transparent up to half opaque (the checks can fail)', { timeout: 3_600_000 }, async () => {
    const report = await fuzzArt({ seed: 41, trials: 10, case: 'frame', looseArt: true });
    console.info(`negative control (levels, art): ${JSON.stringify(report)}`);
    expect(report.artLeaks).toBeGreaterThan(100);
  });
});
