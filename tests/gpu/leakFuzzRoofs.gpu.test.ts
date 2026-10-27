/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { NO_STRETCH } from '../../src/app/grid/mapStretch';
import { artCells } from '../../src/app/levels/artRaster';
import { everyLevelObjects, levelObjects, levelObjectsOn } from '../../src/app/levels/levelObjects';
import { levelStack, shownAt, stackGrid, type LevelStack } from '../../src/app/levels/levelStack';
import { levelSurfaceList } from '../../src/app/levels/levelSurfaces';
import { partyPlaces } from '../../src/app/levels/roofs';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { rulesLookup } from '../../src/app/services/mapRules';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource, LightZone } from '../../src/app/types/lightingTypes';
import type { LevelSurface, SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { SceneModelBuilder } from '../../src/app/vision/sceneModel';
import { belowTokenPerception, sightBelow, type BelowSight } from '../../src/app/vision/throughSight';
import { snapshotGrid } from '../../src/app/pixi/lighting/levels/belowSnapshot';
import { fuzzRooms, rng, type P } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { fakeLevelArt, LEVELS, openLevelsView, paintedTexture, worldOf, type LevelsView } from '../helpers/levelsView';
import { belowArt, cyan, inside, light, surface, token, wallsOn } from '../helpers/levelsFuzz';
import { boxAround, decided, green, orange, roofMap, roofRule, type RoofRule } from '../helpers/roofsFuzz';

vi.mock('events', async () => import('eventemitter3'));

const PANE = 320;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);
const SIDE_TRIALS = Math.max(8, Math.round(TRIALS / 3));
/** A pixel this close (screen px) to an edge of the rule's decision may read either side: the GPU works in single precision. */
const EDGE = 0.05;
const CYAN = paintedTexture(8, 8, () => [20, 230, 230]);

interface Report {
  trials: number;
  /** Pixels where the roof is not drawn (no piece, a faded one, out of the players' sight of it), and those that differ from the scene without it. */
  bare: number;
  bareChanged: number;
  /** Of them, the pixels of faded pieces: Foundry's #14609 showed the floor beneath there. */
  faded: number;
  fadedChanged: number;
  /** Pixels where it is drawn wholly opaque, and those that show its hue. */
  drawn: number;
  drawnShown: number;
  /** Tokens on the viewed level under a drawn roof and not, and those the view's rule disagrees with the rule here on. */
  tokensCovered: number;
  tokensBare: number;
  tokenDisagreements: number;
  /** A roof below: its pixels, its hue where the stack does not show its level or its rule does not draw it, tokens below and disagreements. */
  belowRoof: number;
  belowRoofShown: number;
  belowRoofLeaks: number;
  tokensBelowUnderRoof: number;
  tokensBelowDisagreements: number;
  tokenLeaks: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  map?: number;
  /** Trials of the second family: the viewed level opens onto a level below with a roof of its own. */
  below?: boolean;
  /** The rule here leaves the faded pieces drawn (the negative control). */
  ignoreFading?: boolean;
}

function levelsWith(upperRoof: string | null, groundRoof: string | null): SceneLevel[] {
  return LEVELS.map((level) => ({ ...level, foreground: level.id === 'upper' ? upperRoof : groundRoof }));
}

/**
 * The roof of the viewed level (and in the second family the roof of the level below, seen through an
 * opening) over fuzz rooms, rendered through the real view (`ViewRoofs`, `LightingController`) as the
 * players' frame and held to the rule worked out here on its own (`roofRule`):
 * 1. where the roof is not drawn (no piece, a faded piece, out of the players' sight of it), the
 *    picture is the scene's without the roof, pixel for pixel: a fading roof reveals nothing;
 * 2. where it is drawn wholly opaque, it shows, in its own hue;
 * 3. the view's rule (`ViewRoofs.covers`, the players' perception of tokens below) is the rule here;
 * 4. a roof below shows only where the stack shows its level and its rule draws it, and a token below
 *    under a drawn roof (its level's, or the viewed level's over the opening) is not seen.
 */
async function fuzz({ seed, trials, map = 2048, below = false, ignoreFading = false }: FuzzOptions): Promise<Report> {
  const view: LevelsView = await openLevelsView({ map, pane: PANE, below: belowArt(map), tokenArt: CYAN, roofs: true });
  const report: Report = {
    trials: 0, bare: 0, bareChanged: 0, faded: 0, fadedChanged: 0, drawn: 0, drawnShown: 0, tokensCovered: 0, tokensBare: 0, tokenDisagreements: 0,
    belowRoof: 0, belowRoofShown: 0, belowRoofLeaks: 0, tokensBelowUnderRoof: 0, tokensBelowDisagreements: 0, tokenLeaks: 0,
  };
  const bounds = { width: map, height: map };
  try {
    const rand = rng(seed + 31);
    const uppers = fuzzRooms(seed, trials);
    const lowers = fuzzRooms(seed + 1009, trials);
    for (let n = 0; n < trials; n++) {
      const room = uppers[n]!;
      const lower = lowers[n]!;
      report.trials++;
      const span = Math.max(...room.outline.map(([x, y]) => Math.hypot(x - room.centre[0], y - room.centre[1])));
      const opening = below ? room.outline.map(([x, y]): P => [room.centre[0] + (x - room.centre[0]) * 0.5, room.centre[1] + (y - room.centre[1]) * 0.5]) : null;
      // The viewed level's roof: a house over the room, two roofs elsewhere and an L of two overlapping boxes.
      const boxes = [boxAround(room.centre, span * (0.3 + rand() * 0.4), span * (0.3 + rand() * 0.4), map)];
      for (let i = 0; i < 2; i++) boxes.push(boxAround([rand() * map, rand() * map], 60 + rand() * 200, 60 + rand() * 200, map));
      const corner: P = [rand() * map, rand() * map];
      boxes.push(boxAround(corner, 200, 40, map), boxAround([corner[0] - 160, corner[1] + 80], 40, 120, map));
      // Roof images are read from an overview of at most 2,048 px; a smaller one is scaled onto the map.
      const side = Math.min(2048, n % 3 === 0 ? map / 2 : map);
      const upperRoof = below && n % 2 === 1 ? null : roofMap(side, map, below ? boxes.slice(1) : boxes, 'green', seed * 977 + n);
      const groundRoof = below ? roofMap(Math.min(2048, map), map, [boxAround(room.centre, span * 0.35, span * 0.25, map), boxAround(lower.centre, 150, 150, map)], 'orange', seed * 991 + n) : null;
      view.maps['roof-upper.png'] = upperRoof ?? view.maps['upper.png']!;
      view.maps['roof-ground.png'] = groundRoof ?? view.maps['upper.png']!;

      const ambient = [0, 0.4, 1][n % 3]!;
      const lights: Record<string, LightSource> = {};
      room.lights.forEach((p, i) => { lights[`v${i}`] = light(`v${i}`, p, 'upper', 15 + rand() * 25); });
      lower.lights.forEach((p, i) => { lights[`b${i}`] = light(`b${i}`, p, 'ground', 15 + rand() * 25); });
      const zones: Record<string, LightZone> = n % 5 === 3
        ? { zone: { id: 'zone', kind: 'light-zone', levels: ['upper'], ambient: n % 2 ? 1 : 0.1, polygon: room.outline.map(([x, y]) => ({ x: x * 0.8 + room.centre[0] * 0.2, y: y * 0.8 + room.centre[1] * 0.2 })) } }
        : {};
      const darkvision = n % 2 === 0 ? { senses: [{ id: 'darkvision', range: 60 }] } : {};
      const cone = n % 4 === 2 ? { angle: 60 + rand() * 180 } : {};
      const tokens: Record<string, TokenEntity> = { scout: token('scout', room.lights[0]!, 'upper', { vision: { enabled: true, ...darkvision, ...cone }, rotation: rand() * 360 }) };
      // A second party token in a roof elsewhere fades it; others stand anywhere, under roofs or not.
      if (n % 4 === 1) tokens.ally = token('ally', [(boxes[1]![0] + boxes[1]![2]) / 2, (boxes[1]![1] + boxes[1]![3]) / 2], 'upper', { vision: { enabled: true } });
      for (let i = 0; i < 6; i++) {
        const box = boxes[i % boxes.length]!;
        const at: P = i < 3 ? [box[0] + rand() * (box[2] - box[0]), box[1] + rand() * (box[3] - box[1])] : [rand() * map, rand() * map];
        tokens[`t${i}`] = token(`t${i}`, at, 'upper');
      }
      if (opening) {
        for (let i = 0; i < 4; i++) {
          const at = i < 3 ? inside(opening, rand) : inside(lower.outline, rand);
          if (at) tokens[`m${i}`] = token(`m${i}`, at, 'ground', i === 2 && n % 3 === 0 ? { vision: { enabled: true } } : {});
        }
      }
      const surfaces: Record<string, LevelSurface> = opening ? { hole: surface('hole', opening, true) } : {};

      const { store } = view;
      view.controller.renderer.beforeMapUnload();
      store.getState().setMapPath(`maps/roofs-${seed}-${n}.atlasmap`);
      const objects = { ...store.getState().objects, tokens, walls: { ...wallsOn(room, 'v', 'upper'), ...wallsOn(lower, 'b', 'ground') }, lights, lightZones: zones, levelSurfaces: surfaces };
      const scene = (roofs: boolean): void => store.setState({
        mapLoaded: true, isMapLoading: false, viewedLevel: 'upper', exploredMask: null, exploredMasks: undefined, objects,
        levels: levelsWith(roofs && upperRoof ? 'roof-upper.png' : null, roofs && groundRoof ? 'roof-ground.png' : null),
      });
      scene(false);
      store.getState().setSceneLighting({ enabled: true, ambient });
      await view.settle();
      const scale = 0.2 + rand() * 1.2;
      const [fx, fy] = opening ? room.centre : rand() < 0.5 ? room.centre : [(boxes[3]![0] + boxes[3]![2]) / 2, (boxes[3]![1] + boxes[3]![3]) / 2];
      const x = PANE / 2 - fx * scale + (rand() - 0.5) * 100;
      const y = PANE / 2 - fy * scale + (rand() - 0.5) * 100;
      const reference = await view.settledPlayerFrame(scale, x, y);
      scene(true);
      await view.settle();
      const frame = await view.settledPlayerFrame(scale, x, y);

      // The rule, worked out here from the same scene.
      const state = store.getState();
      const renderer = view.controller.renderer;
      const everyToken = everyLevelObjects(state).tokens;
      const viewedSight = renderer.currentSight();
      const upper: RoofRule | null = upperRoof && roofRule(upperRoof, NO_STRETCH, bounds, partyPlaces(levelObjects(state).tokens), viewedSight, everyToken, renderer.ambientLight(), bounds);
      if (upper && ignoreFading) upper.faded.clear();
      let lowerRule: RoofRule | null = null;
      let stack: LevelStack | null = null;
      let belowSight: BelowSight | null = null;
      if (groundRoof) {
        const grid = stackGrid(bounds);
        const groundArt = artCells(fakeLevelArt({ texture: Texture.EMPTY, ...bounds }), NO_STRETCH, true, grid);
        stack = levelStack({ id: 'upper', surfaces: levelSurfaceList(levelObjects(state).levelSurfaces) }, [{ id: 'ground', surfaces: [], art: groundArt }], ['ground'], grid);
        const measurement = () => mapMeasurementSettings(rulesLookup(view.obsApp), state);
        const { model } = new SceneModelBuilder().update({ ...state, viewedLevel: 'ground' }, bounds, measurement);
        const sight = sightBelow(viewedSight, model.sight);
        belowSight = { stack, index: 1, sight, ambient: model.ambient, reaches: model.reaches };
        lowerRule = roofRule(groundRoof, NO_STRETCH, bounds, partyPlaces(levelObjectsOn(state, 'ground').tokens), sight, everyToken, { ...state.lighting, ...model.ambient }, bounds);
      }
      const upperDrawn = (p: { x: number; y: number }): boolean => upper?.drawnAt(p) ?? false;
      // The level below is read from its snapshot texel by texel: a pixel may show the texel whose middle lies half a texel's diagonal away.
      const belowEdge = EDGE / scale + (stack ? stack.grid.texel * 0.02 + (snapshotGrid(stack)?.texel ?? 0) * Math.SQRT1_2 : 0);

      // Tokens on the viewed level: the view's rule is the rule here.
      for (const entry of Object.values(levelObjects(state).tokens)) {
        if (!upper || !decided(upperDrawn, entry, EDGE / scale)) continue;
        const covered = upper.drawnAt(entry);
        if (covered) report.tokensCovered++;
        else report.tokensBare++;
        if (view.roofs!.covers(entry) !== covered) report.tokenDisagreements++;
      }
      // Tokens below: unseen under a drawn roof, theirs or the viewed level's over the opening.
      const unseenBelow: TokenEntity[] = [];
      const seenBelow: TokenEntity[] = [];
      if (belowSight && lowerRule) {
        const tokensBelow = levelObjectsOn(state, 'ground').tokens;
        const rule = belowTokenPerception(belowSight, tokensBelow, { viewed: undefined, below: undefined }, undefined, undefined, (at) => upperDrawn(at) || lowerRule!.drawnAt(at));
        const theView = renderer.belowTokenPerception?.();
        for (const entry of Object.values(tokensBelow)) {
          if (!decided((p) => upperDrawn(p) || lowerRule!.drawnAt(p), entry, EDGE / scale)) continue;
          if (upperDrawn(entry) || lowerRule.drawnAt(entry)) report.tokensBelowUnderRoof++;
          const perceived = rule(entry.id);
          if (theView && theView(entry.id) !== perceived) report.tokensBelowDisagreements++;
          (perceived === 'seen' ? seenBelow : unseenBelow).push(entry);
        }
      }

      for (let sy = 0; sy < PANE; sy++) {
        for (let sx = 0; sx < PANE; sx++) {
          const p = worldOf(sx, sy, 1, scale, x, y);
          if (p.x < 0 || p.y < 0 || p.x >= map || p.y >= map) continue;
          const o = (sy * PANE + sx) * 4;
          const differs = frame[o] !== reference[o] || frame[o + 1] !== reference[o + 1] || frame[o + 2] !== reference[o + 2];
          const near = (entry: TokenEntity): boolean => Math.hypot(entry.x - p.x, entry.y - p.y) < 33;
          if (cyan(frame, o) && unseenBelow.some(near) && !seenBelow.some(near)) report.tokenLeaks++;
          if (lowerRule && stack) {
            const shown = (q: { x: number; y: number }): boolean => shownAt(stack!, q) === 1 && lowerRule!.drawnAt(q) && !upperDrawn(q);
            if (decided(shown, p, belowEdge)) {
              if (shown(p)) {
                report.belowRoof++;
                if (orange(frame, o)) report.belowRoofShown++;
              } else if (orange(frame, o)) report.belowRoofLeaks++;
            }
          }
          if (!upper || !decided(upperDrawn, p, EDGE / scale)) continue;
          if (upper.drawnAt(p)) {
            if (!upper.solidAt(p)) continue;
            report.drawn++;
            if (differs && green(frame, o)) report.drawnShown++;
          } else if (!lowerRule || (decided((q) => lowerRule!.drawnAt(q) && shownAt(stack!, q) === 1, p, belowEdge)
            && !(lowerRule.drawnAt(p) && shownAt(stack!, p) === 1) && !Object.values(levelObjectsOn(state, 'ground').tokens).some(near))) {
            // Where the roof below is drawn the frame differs from the reference by that roof, not this one; and the
            // tokens below a roof hides (art and all) are missing from the frame beside the roof too.
            report.bare++;
            if (differs) report.bareChanged++;
            const { a, b, c, d, tx, ty } = upper.transform;
            const id = upper.pieces.ids[Math.floor(b * p.x + d * p.y + ty) * upper.pieces.width + Math.floor(a * p.x + c * p.y + tx)];
            if (id && upper.faded.has(id)) {
              report.faded++;
              if (differs) report.fadedChanged++;
            }
          }
        }
      }
    }
    return report;
  } finally {
    view.dispose();
  }
}

const CLEAN = { bareChanged: 0, fadedChanged: 0, tokenDisagreements: 0, belowRoofLeaks: 0, tokensBelowDisagreements: 0, tokenLeaks: 0 };

describe('leak fuzz: roofs', () => {
  it('draws the viewed level\'s roof only where its rule does, and where a piece fades, the picture is the scene\'s without the roof', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 7, trials: TRIALS });
    console.info(`leak fuzz (roofs): ${JSON.stringify(report)}`);
    expect(report).toMatchObject(CLEAN);
    expect(report.bare).toBeGreaterThan(TRIALS * 1000);
    expect(report.faded).toBeGreaterThan(TRIALS * 100);
    expect(report.drawn).toBeGreaterThan(TRIALS * 500);
    expect(report.drawnShown).toBe(report.drawn);
    expect(report.tokensCovered).toBeGreaterThan(0);
    expect(report.tokensBare).toBeGreaterThan(0);
  });

  it('draws a roof of the level below only through the openings, where its rule does, and hides the tokens under it', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 11, trials: SIDE_TRIALS, below: true });
    console.info(`leak fuzz (roofs below): ${JSON.stringify(report)}`);
    expect(report).toMatchObject(CLEAN);
    expect(report.belowRoof).toBeGreaterThan(SIDE_TRIALS * 100);
    expect(report.belowRoofShown).toBeGreaterThan(report.belowRoof * 0.5);
    expect(report.tokensBelowUnderRoof).toBeGreaterThan(0);
  });

  it('holds on a map of 8192 px', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 13, trials: SIDE_TRIALS, map: 8192 });
    console.info(`leak fuzz (roofs, 8192 px): ${JSON.stringify(report)}`);
    expect(report).toMatchObject(CLEAN);
    expect(report.drawnShown).toBe(report.drawn);
  });

  it('finds the floor beneath a faded piece where the rule leaves it drawn (the checks can fail)', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 7, trials: 8, ignoreFading: true });
    console.info(`negative control (roofs): ${JSON.stringify(report)}`);
    expect(report.drawn - report.drawnShown).toBeGreaterThan(100);
  });
});
