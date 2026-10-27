import { showsMap } from '../../src/app/gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../src/app/gameSystems/senses/generic';
import { imageToWorld, imageWorldRect, NO_STRETCH, worldToImage, type MapStretch } from '../../src/app/grid/mapStretch';
import { artCells } from '../../src/app/levels/artRaster';
import { levelImagePlacement } from '../../src/app/levels/levelAlignment';
import { levelObjectsOn } from '../../src/app/levels/levelObjects';
import { levelStack, levelsShownBelow, shownAt, stackGrid, VIEWED, VOID, type LevelStack } from '../../src/app/levels/levelStack';
import { levelSurfaceList } from '../../src/app/levels/levelSurfaces';
import { stampClip } from '../../src/app/levels/stackClip';
import { belowQuality, LIGHTING_QUALITY, type LightingQuality } from '../../src/app/lighting/lightingQuality';
import { wallBand, worldTexel } from '../../src/app/lighting/lightingConstants';
import { distToSeg } from '../../src/app/lighting/segments';
import { exploredGrid } from '../../src/app/pixi/lighting/ExploredTexture';
import { fuzzRooms, rng, type FuzzRoom, type P } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { rulesLookup } from '../../src/app/services/mapRules';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { LevelAlignment, LevelSurface, SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { lightLevelAt } from '../../src/app/vision/lightLevels';
import { perceive, regionContains } from '../../src/app/vision/perception';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import { litPolygons, type Sight } from '../../src/app/vision/sight';
import { belowTokenPerception, sightBelow, type BelowSight } from '../../src/app/vision/throughSight';
import type { MapBounds } from '../../src/app/vision/visibility';
import { cyan, inPlainView, inside, light, lit, maskAlpha, nearAllowed, surface, toEdges, token, wallsOn } from '../helpers/levelsFuzz';
import { openLevelsView, paintedTexture, worldOf, type LevelsView } from '../helpers/levelsView';
import { artMap, artNear, holesAbout, hueOf, solidNear, type ArtMap, type Hue } from './levelsArtScene';

/**
 * How the levels lie: all on one canvas (`frame`); the viewed level a smaller tower placed over
 * the ground (`tower`); the viewed level's image turned and stretched (`turned`); its image twice
 * the map's size, read through a resized overview as the tile worker reads it (`large`).
 */
export type ArtCase = 'frame' | 'tower' | 'turned' | 'large';

/**
 * What each trial varies: transparent holes in the viewed level and the ground floor (`holes`), the
 * viewed level seeing only the cellar (`cellar`), the ground floor's transparent parts closed
 * (`closed`), an opening and a floor drawn over the holes too (`drawn`), and art without a hole
 * and no surface (`opaque`: the picture before openings).
 */
const KINDS = ['holes', 'cellar', 'closed', 'drawn', 'opaque'] as const;
type Kind = (typeof KINDS)[number];

const PANE = 320;
const CYAN = paintedTexture(8, 8, () => [20, 230, 230]);
const HUES: Record<string, Hue> = { ground: 'magenta', cellar: 'yellow' };

export interface ArtFuzzOptions {
  seed: number;
  trials: number;
  case: ArtCase;
  /** The map's side; images are 2,048 px at most and scaled onto larger maps. */
  map?: number;
  quality?: LightingQuality;
  resolution?: number;
  /** The view and the rule read art as transparent up to half opaque (the negative control: art then shows what lies under it). */
  looseArt?: boolean;
}

export interface ArtReport {
  rooms: number;
  kinds: Record<Kind, number>;
  /** Pixels where the stack shows the viewed level, and those that differ from the scene seeing nothing below. */
  viewed: number;
  viewedChanged: number;
  voids: number;
  voidsLit: number;
  /** Pixels showing each level below, by stack index, and those with its hue. */
  below: [number, number];
  belowHue: [number, number];
  /** A level's hue where no line of sight reaches it; another level's hue where the stack shows one; any level below where art lies above it. */
  leaks: number;
  wrongLevel: number;
  artLeaks: number;
  seenLit: number;
  seenShown: number;
  tokensSeen: number;
  tokensUnseen: number;
  tokenDisagreements: number;
  tokenLeaks: number;
  /** Trials of opaque art: pixels that differ from the picture before openings, tokens below perceived, levels below built. */
  opaque: number;
  opaqueChanged: number;
  opaqueTokens: number;
  opaqueLevels: number;
  /** Memories of the levels below saved: texels remembered, and those outside the texels their openings showed. */
  memories: number;
  remembered: number;
  rememberedOutside: number;
}

interface LevelOfTrial {
  id: string;
  map: ArtMap;
  background: string;
  placement: MapStretch;
  room: FuzzRoom;
}

/** Image `id`'s placement for a case: the viewed level's own alignment, or the frame; images on large maps are scaled up. */
function alignments(kind: ArtCase, mapScale: number, upperSize: { width: number; height: number }, room: FuzzRoom, map: number, rand: () => number): Record<string, LevelAlignment> {
  const scaled = (offset = { x: 0, y: 0 }, stretch: MapStretch = NO_STRETCH, scale = mapScale): LevelAlignment => ({ offset, scale, stretch });
  const frame: Record<string, LevelAlignment> = mapScale === 1 ? {} : { ground: scaled(), cellar: scaled() };
  if (kind === 'tower') {
    const [cx, cy] = room.centre;
    const offset = { x: Math.max(0, Math.min(map - upperSize.width * mapScale, cx - (upperSize.width * mapScale) / 2)), y: Math.max(0, Math.min(map - upperSize.height * mapScale, cy - (upperSize.height * mapScale) / 2)) };
    return { ...frame, upper: scaled(offset) };
  }
  if (kind === 'turned') return { ...frame, upper: scaled(undefined, { x: 1 + rand() * 0.1, y: 1, rotation: (rand() < 0.5 ? -1 : 1) * (1 + rand() * 3) }) };
  if (kind === 'large') return { ...frame, upper: scaled(undefined, NO_STRETCH, mapScale / 2) };
  return mapScale === 1 ? frame : { ...frame, upper: scaled() };
}

/** Image pixels of world point `p` on a level placed by `placement`. */
function onImage(level: LevelOfTrial, p: { x: number; y: number }): { x: number; y: number } {
  return worldToImage(p, level.map, level.placement);
}

/**
 * Three floors of fuzz rooms (cellar, ground floor, upper floor) whose maps have transparent parts,
 * the view on the upper floor looking down through them (and through openings drawn on it) at the
 * two floors below, rendered through the real view as the players' frame. What it holds:
 * 1. where the stack shows the viewed level, the picture is that of the scene seeing nothing below, pixel for pixel;
 * 2. no pixel shows a level below where the stack shows another level, or wherever the true art of a level above it is not transparent;
 * 3. no pixel shows a level's hue where no line of sight reaches it, beyond 1.5 screen px of filtering at sight edges;
 * 4. where the rule counts a level below seen by sight in the light, it shows;
 * 5. tokens below show only where the rule perceives them, and the view perceives them as the rule does;
 * 6. art without a transparent part and no surface gives the picture of the scene without openings, and builds nothing below;
 * 7. the memories below, saved, hold nothing outside the texels the stack showed them in.
 * Where the stack shows nothing, the picture is black.
 */
export async function fuzzArt({ seed, trials, case: kind, map = 2048, quality, resolution = 1, looseArt = false }: ArtFuzzOptions): Promise<ArtReport> {
  const view: LevelsView = await openLevelsView({ map, pane: PANE, resolution, tokenArt: CYAN, ...(quality && { quality }) });
  const device = PANE * resolution;
  const report: ArtReport = {
    rooms: 0, kinds: { holes: 0, cellar: 0, closed: 0, drawn: 0, opaque: 0 }, viewed: 0, viewedChanged: 0, voids: 0, voidsLit: 0,
    below: [0, 0], belowHue: [0, 0], leaks: 0, wrongLevel: 0, artLeaks: 0, seenLit: 0, seenShown: 0,
    tokensSeen: 0, tokensUnseen: 0, tokenDisagreements: 0, tokenLeaks: 0, opaque: 0, opaqueChanged: 0, opaqueTokens: 0, opaqueLevels: 0,
    memories: 0, remembered: 0, rememberedOutside: 0,
  };
  const textures: ArtMap[] = [];
  try {
    const rand = rng(seed + 31);
    const rooms = { upper: fuzzRooms(seed, trials), ground: fuzzRooms(seed + 1009, trials), cellar: fuzzRooms(seed + 2017, trials) };
    const side = Math.min(map, 2048);
    const mapScale = map / side;
    for (let n = 0; n < trials; n++) {
      const trial = KINDS[n % KINDS.length]!;
      // Opaque art shows nothing below only where the viewed level covers the whole map.
      const opaque = trial === 'opaque' && (kind === 'frame' || kind === 'large');
      const kindOfTrial: Kind = trial === 'opaque' && !opaque ? 'holes' : trial;
      report.rooms++;
      report.kinds[kindOfTrial]++;
      const room = { upper: rooms.upper[n]!, ground: rooms.ground[n]!, cellar: rooms.cellar[n]! };
      // The upper floor's image: a tower smaller than the map, twice the map's pixels, or the map's own.
      const upperSide = kind === 'tower' ? Math.round(side * (0.45 + rand() * 0.2)) : kind === 'large' ? side * 2 : side;
      const upperSize = { width: upperSide, height: upperSide };
      const fitted = alignments(kind, mapScale, upperSize, room.upper, map, rand);
      const placed = (id: string): MapStretch => levelImagePlacement({ grid: view.store.getState().grid, levelAlignments: fitted }, id);
      // Holes where the scout looks, in the image's own pixels.
      const pixelsOf = (points: readonly P[], size: { width: number; height: number }, placement: MapStretch): P[] => points.map(([px, py]) => {
        const at = worldToImage({ x: px, y: py }, size, placement);
        return [at.x, at.y];
      });
      // The first hole lies beside the scout: where it looks down, through a hole of the ground floor too.
      const upperHoles = opaque ? [] : holesAbout(pixelsOf([room.upper.lights[0]!, room.upper.centre], upperSize, placed('upper')), upperSide, upperSide, rand);
      const lookDown = upperHoles[0] && imageToWorld(upperHoles[0], upperSize, placed('upper'));
      const groundLooks: P[] = lookDown ? [[lookDown.x, lookDown.y], room.cellar.centre] : [room.cellar.centre];
      const upperMap = await artMap(upperSide, upperSide, 'grey', upperHoles);
      const groundMap = await artMap(side, side, 'magenta', holesAbout(pixelsOf(groundLooks, { width: side, height: side }, placed('ground')), side, side, rand));
      const cellarMap = await artMap(side, side, 'yellow', []);
      textures.push(upperMap, groundMap, cellarMap);
      if (looseArt) for (const entry of [upperMap, groundMap]) entry.alpha = loosely(entry);
      const paths = { upper: `upper-${seed}-${n}.png`, ground: `ground-${seed}-${n}.png`, cellar: `cellar-${seed}-${n}.png` };
      Object.assign(view.maps, { [paths.upper]: upperMap, [paths.ground]: groundMap, [paths.cellar]: cellarMap });
      const levels: SceneLevel[] = [
        { id: 'cellar', name: 'Cellar', elevation: { bottom: 0, top: 10 }, background: paths.cellar },
        { id: 'ground', name: 'Ground', elevation: { bottom: 10, top: 20 }, background: paths.ground, ...(kindOfTrial === 'closed' && { openArt: false as const }) },
        { id: 'upper', name: 'Upper', elevation: { bottom: 20, top: 30 }, background: paths.upper, ...(kindOfTrial === 'cellar' && { sees: ['cellar'] }) },
      ];
      // Openings drawn over the holes too: one over the scout's room, a floor over part of it.
      const [ux, uy] = room.upper.centre;
      const drawn: Record<string, LevelSurface> = kindOfTrial === 'drawn' ? {
        hole: surface('hole', room.upper.outline.map(([x, y]): P => [ux + (x - ux) * 0.4, uy + (y - uy) * 0.4]), true),
        plank: surface('plank', [[ux - 40, uy - 300], [ux + 40, uy - 300], [ux + 40, uy + 300], [ux - 40, uy + 300]], false),
      } : {};
      const ambient = [0, 0.4, 1][n % 3]!;
      const lights: Record<string, LightSource> = {};
      for (const [id, entry] of Object.entries(room)) {
        entry.lights.forEach((p, i) => { lights[`${id}${i}`] = light(`${id}${i}`, p, id, 15 + rand() * 25, n % 3 === 0 && id !== 'upper' ? { angle: 40 + rand() * 260 } : {}, n % 3 === 0 ? rand() * 360 : undefined); });
      }
      const tokens: Record<string, TokenEntity> = { scout: token('scout', room.upper.lights[0]!, 'upper', { vision: { enabled: true, ...(n % 2 === 0 && { senses: [{ id: 'darkvision', range: 60 }] }) } }) };
      for (const id of ['ground', 'cellar'] as const) {
        for (let i = 0; i < 3; i++) {
          const at = inside(room[id].outline, rand);
          if (at) tokens[`${id}${i}`] = token(`${id}${i}`, at, id, i === 1 ? { isHidden: true } : {});
        }
        // One where the scout looks down through the first hole, in the light of a lamp of its own level.
        const watched: P | null = lookDown ? [lookDown.x + (id === 'ground' ? upperHoles[0]!.r * 0.5 : 0), lookDown.y] : inPlainView(room.upper.lights[0]!, room[id].outline, room.upper.walls, rand);
        if (watched) {
          tokens[`${id}Watched`] = token(`${id}Watched`, watched, id);
          lights[`${id}Lamp`] = light(`${id}Lamp`, watched, id, 12);
        }
      }
      // A party token below records its own sight into its level's memory: not in the trials that check what the openings record.
      if (n % 4 === 1 && n % 5 !== 0) {
        const at = inside(room.ground.outline, rand);
        if (at) tokens.ally = token('ally', at, 'ground', { vision: { enabled: true } });
      }
      const { store } = view;
      // Another scene is loaded, as a map view loads one: nothing is lit or recorded in between.
      store.setState({ isMapLoading: true });
      view.controller.renderer.beforeMapUnload();
      store.getState().setMapPath(`maps/levels-art-${seed}-${n}.atlasmap`);
      const objects = {
        ...store.getState().objects,
        tokens, lights, lightZones: {},
        walls: { ...wallsOn(room.upper, 'u', 'upper'), ...wallsOn(room.ground, 'g', 'ground'), ...wallsOn(room.cellar, 'c', 'cellar') },
      };
      await view.showViewedMap(paths.upper, placed('upper'));
      // The scene seeing nothing below first: the picture before openings.
      const seesNothing = levels.map((level) => (level.id === 'upper' ? { ...level, sees: [] } : level));
      store.setState({
        mapLoaded: true, isMapLoading: false, background: paths.cellar, levels: seesNothing, levelAlignments: fitted, viewedLevel: 'upper',
        exploredMask: null, exploredMasks: undefined, objects: { ...objects, levelSurfaces: {} },
      });
      store.getState().setSceneLighting({ enabled: true, ambient });
      await view.settle();
      const scale = (0.25 + rand() * 1.25) / mapScale;
      const [fx, fy] = kind === 'tower' || rand() < 0.5 ? room.upper.lights[0]! : room.upper.centre;
      const x = PANE / 2 - fx * scale + (rand() - 0.5) * 120;
      const y = PANE / 2 - fy * scale + (rand() - 0.5) * 120;
      const reference = await view.settledPlayerFrame(scale, x, y);
      store.setState({ levels, objects: { ...objects, levelSurfaces: drawn } });
      await view.settle();
      await view.settle();
      const frame = await view.settledPlayerFrame(scale, x, y);
      const state = store.getState();

      // The rule, worked out here from the same scene.
      const trialLevels: Record<string, LevelOfTrial> = {
        upper: { id: 'upper', map: upperMap, background: paths.upper, placement: placed('upper'), room: room.upper },
        ground: { id: 'ground', map: groundMap, background: paths.ground, placement: placed('ground'), room: room.ground },
        cellar: { id: 'cellar', map: cellarMap, background: paths.cellar, placement: placed('cellar'), room: room.cellar },
      };
      const rects: Record<string, MapBounds> = Object.fromEntries(Object.values(trialLevels).map((level) => [level.id, imageWorldRect(level.map, level.placement)]));
      const shown = levelsShownBelow(levels, 'upper');
      const union = { width: Math.max(rects.upper!.width, ...shown.map((id) => rects[id]!.width)), height: Math.max(rects.upper!.height, ...shown.map((id) => rects[id]!.height)) };
      const grid = stackGrid(union);
      const stackLevel = (id: string): { id: string; surfaces: LevelSurface[]; art: ReturnType<typeof artCells> } => ({
        id, surfaces: levelSurfaceList(levelObjectsOn(state, id).levelSurfaces),
        art: artCells({ width: trialLevels[id]!.map.width, height: trialLevels[id]!.map.height, alpha: trialLevels[id]!.map.alpha }, trialLevels[id]!.placement, levels.find((level) => level.id === id)!.openArt !== false, grid),
      });
      const stack: LevelStack = levelStack(stackLevel('upper'), [stackLevel('ground'), stackLevel('cellar')], shown, grid);
      const viewed: Sight = view.controller.renderer.currentSight();
      const measurement = () => mapMeasurementSettings(rulesLookup(view.obsApp), state);
      const filter = 1.5 / scale + 0.01;
      // The players' badges on the viewed level's doors stand over everything, the openings too; their rim reaches a little past 20 px.
      const doors = room.upper.walls.filter((wall) => wall.type === 'door').map((wall) => ({ x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 }));
      const onBadge = (p: { x: number; y: number }): boolean => doors.some((door) => Math.hypot(door.x - p.x, door.y - p.y) < 24 / scale);
      // An opening drawn on the viewed level opens its floor whatever its art.
      const drawnOpen = (p: { x: number; y: number }): boolean => {
        let open = false;
        for (const entry of levelSurfaceList(drawn)) if (insidePolygon(p, entry.polygon)) open = entry.open;
        return open;
      };
      const lookBelow = shown.map((id, i) => {
        const seen = { ...state, viewedLevel: id };
        const { model } = new SceneModelBuilder().update(seen, rects[id]!, measurement);
        const below: BelowSight = { stack, index: i + 1, sight: sightBelow(viewed, model.sight), ambient: model.ambient, reaches: model.reaches };
        const regions = below.sight.regions.filter((region) => showsMap(region.sense));
        const spots = new SceneSpots().update(model, seen, measurement).map((spot) => spot.polygon);
        const sightEdges = [...regions.flatMap((region) => (region.polygon ? [region.polygon] : [])), ...spots];
        const lightEdges = [...sightEdges, ...model.reaches.flatMap(litPolygons)];
        const texel = worldTexel(rects[id]!, belowQuality(quality ?? LIGHTING_QUALITY.high).maxTexels);
        const walls = Object.values(wallsOn(trialLevels[id]!.room, '', id));
        const isShown = (p: { x: number; y: number }): boolean => below.sight.all || regions.some((region) => regionContains(region, p)) || spots.some((polygon) => insidePolygon(p, polygon));
        const normal: Sight = { all: below.sight.all, regions: below.sight.regions.filter((region) => region.sense === NORMAL_SIGHT) };
        return { id, below, sightEdges, lightEdges, texel, walls, isShown, normal, tokens: levelObjectsOn(state, id).tokens };
      });

      // Tokens below: the view's perception is the rule's, and an unseen one shows nowhere.
      const theView = view.controller.renderer.belowTokenPerception?.();
      const seenTokens: TokenEntity[] = [];
      const unseenTokens: TokenEntity[] = [];
      for (const level of lookBelow) {
        const rule = belowTokenPerception(level.below, level.tokens, { viewed: undefined, below: undefined });
        for (const entry of Object.values(level.tokens)) {
          const perceived = rule(entry.id);
          if (theView && theView(entry.id) !== perceived) report.tokenDisagreements++;
          if (perceived === 'seen') seenTokens.push(entry);
          else unseenTokens.push(entry);
        }
      }
      // Tokens of a level below that the view does not draw (not seen) are never perceived.
      for (const id of ['ground', 'cellar']) {
        if (shown.includes(id)) continue;
        for (const entry of Object.values(levelObjectsOn(state, id).tokens)) if (theView && theView(entry.id) !== 'unseen') report.tokenDisagreements++;
      }
      report.tokensSeen += seenTokens.length;
      report.tokensUnseen += unseenTokens.length;

      if (opaque) {
        report.opaque++;
        for (let i = 0; i < frame.length; i++) if (frame[i] !== reference[i]) report.opaqueChanged++;
        if (seenTokens.length > 0) report.opaqueTokens++;
        const host = view.controller.renderer as unknown as { view: { levelsBelow: { levels: Map<string, unknown> } } };
        report.opaqueLevels += host.view.levelsBelow.levels.size;
        continue;
      }

      const edgeSlack = 0.01 / (scale * resolution * grid.texel);
      for (let sy = 0; sy < device; sy++) {
        for (let sx = 0; sx < device; sx++) {
          const p = worldOf(sx, sy, resolution, scale, x, y);
          if (p.x < 0 || p.y < 0 || p.x >= union.width || p.y >= union.height) continue;
          const o = (sy * device + sx) * 4;
          // A pixel whose middle lies within a hundredth of a device pixel of a texel's edge may read either texel.
          const cx = p.x / grid.texel;
          const cy = p.y / grid.texel;
          if (Math.abs(cx - Math.round(cx)) < edgeSlack || Math.abs(cy - Math.round(cy)) < edgeSlack) continue;
          const k = shownAt(stack, p);
          const hue = hueOf(frame, o);
          const anyBelow = hue !== null || cyan(frame, o);
          // Art above a level below: the viewed level's wherever it shows a level below, the ground floor's over the cellar
          // (all of the ground floor's image where its transparent parts are floor).
          const upperArt = artNear(trialLevels.upper!.map, ...xy(onImage(trialLevels.upper!, p)));
          const groundAt = onImage(trialLevels.ground!, p);
          const groundBlocks = levels[1]!.openArt === false ? onMap(trialLevels.ground!.map, groundAt) : artNear(trialLevels.ground!.map, groundAt.x, groundAt.y);
          if (((anyBelow && upperArt && !drawnOpen(p)) || (hue === 'yellow' && groundBlocks)) && !onBadge(p)) report.artLeaks++;
          if (k === VIEWED) {
            if (p.x >= rects.upper!.width || p.y >= rects.upper!.height) continue;
            report.viewed++;
            if (frame[o] !== reference[o] || frame[o + 1] !== reference[o + 1] || frame[o + 2] !== reference[o + 2]) report.viewedChanged++;
            continue;
          }
          if (k === VOID) {
            report.voids++;
            if (lit(frame, o) && !onBadge(p)) report.voidsLit++;
            continue;
          }
          const level = lookBelow[k - 1]!;
          report.below[k - 1] = report.below[k - 1]! + 1;
          if (hue && hue !== HUES[level.id]) report.wrongLevel++;
          if (hue === HUES[level.id]) {
            report.belowHue[k - 1] = report.belowHue[k - 1]! + 1;
            if (!level.isShown(p) && toEdges(p, level.sightEdges) > filter) report.leaks++;
          }
          const light = lightLevelAt(p, level.below.ambient, level.below.reaches);
          const clear = toEdges(p, level.lightEdges) > filter + 40 && level.walls.every((wall) => distToSeg(p.x, p.y, [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y]) > wallBand(level.texel) + filter);
          // Its own art solid around the point: where it fades, a level shows as faintly as it is drawn.
          const solid = solidNear(trialLevels[level.id]!.map, ...xy(onImage(trialLevels[level.id]!, p)));
          if (clear && solid && (light === 'bright' || light === 'dim') && perceive(p, level.normal, light) === 'seen' && Object.values(level.tokens).every((entry) => Math.hypot(entry.x - p.x, entry.y - p.y) > 40)) {
            report.seenLit++;
            if (hue === HUES[level.id]) report.seenShown++;
          }
          const near = (entry: TokenEntity): boolean => Math.hypot(entry.x - p.x, entry.y - p.y) < 33;
          if (cyan(frame, o) && !onBadge(p) && unseenTokens.some(near) && !seenTokens.some(near)) report.tokenLeaks++;
        }
      }

      if (n % 5 === 0) {
        // What the openings showed of each level below is saved into its memory.
        view.controller.renderer.beforeMapUnload();
        await view.settle();
        for (const level of lookBelow) {
          const mask = level.id === 'cellar' ? view.store.getState().exploredMask : view.store.getState().exploredMasks?.[level.id];
          if (!mask) continue;
          report.memories++;
          const bounds = rects[level.id]!;
          const clip = stampClip(stack, level.below.index, { ...exploredGrid(bounds), mapWidth: bounds.width, mapHeight: bounds.height });
          const saved = await maskAlpha(mask);
          for (let my = 0; my < saved.height; my++) {
            for (let mx = 0; mx < saved.width; mx++) {
              if (!saved.alpha[my * saved.width + mx]) continue;
              report.remembered++;
              if (!nearAllowed(clip, mx, my, 0)) report.rememberedOutside++;
            }
          }
        }
      }
    }
    return report;
  } finally {
    view.dispose();
    for (const entry of textures) entry.texture.destroy(true);
  }
}

/** What a map holds as art read loosely: only pixels more than half opaque. */
function loosely(map: ArtMap): ArtMap['alpha'] {
  if (map.alpha.width !== map.width) throw new Error('A loose read is made only of maps the worker reads whole');
  return { width: map.width, height: map.height, opaque: Uint8Array.from(map.trueAlpha, (a) => (a > 128 ? 1 : 0)) };
}

function xy(p: { x: number; y: number }): [number, number] {
  return [p.x, p.y];
}

/** Whether image point `p` lies on the map or within one pixel of it. */
function onMap(map: ArtMap, p: { x: number; y: number }): boolean {
  return p.x > -1 && p.y > -1 && p.x < map.width + 1 && p.y < map.height + 1;
}

function insidePolygon(p: { x: number; y: number }, polygon: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** What every run holds. */
export const ART_CLEAN = { viewedChanged: 0, voidsLit: 0, leaks: 0, wrongLevel: 0, artLeaks: 0, tokenDisagreements: 0, tokenLeaks: 0, opaqueChanged: 0, opaqueTokens: 0, opaqueLevels: 0, rememberedOutside: 0 };
