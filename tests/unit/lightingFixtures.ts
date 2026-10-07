import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { exploredMemoryOn } from '../../src/app/lighting/sceneLightingOptions';
import type { ExploredImage } from '../../src/app/pixi/lighting/playerDarkness/darknessRaster';
import { heldForSight } from '../../src/app/lighting/sightOnDrop';
import { playerLightingOf, type PlayerLighting } from '../../src/app/pixi/lighting/playerLightingLayers';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import type { MapSize } from '../../src/app/services/viewMapSize';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import type { GridState } from '../../src/app/types/gridTypes';
import { DEFAULT_SCENE_LIGHTING, type LightSource, type SceneLighting } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { SEES_ALL } from '../../src/app/vision/sight';
import type { SightRules } from '../../src/app/vision/sightRules';

export type LitState = Pick<ViewAtlasState, 'objects' | 'lighting' | 'grid' | 'heldTokens'>;

/**
 * The players' lighting as the GM's lighting view works it out from the store (`LightingRenderer`:
 * `SceneModelBuilder`, `SceneSpots`, then `tokenPerception` as `playerTokenSight` calls it), with
 * Atlas's own CPU code and no GPU, handed to the shipped `playerLightingOf`. Undefined while the scene is unlit.
 */
export function lightingFromStore(state: LitState, map: MapSize, rules?: SightRules): PlayerLighting | undefined {
  if (!state.lighting.enabled) return undefined;
  const measurement = () => resolveMeasurementSettings(undefined, state.grid);
  const sightRules = rules && ((): SightRules => rules);
  const { model } = new SceneModelBuilder().update(state, map, measurement, sightRules);
  const spots = new SceneSpots().update(model, state, measurement, sightRules);
  const perception = tokenPerception(model.sight, model.ambient, model.reaches, state.objects.tokens, {
    conditions: rules?.conditions ?? [], held: heldForSight(state),
  });
  const view = {
    sightReady: () => true, currentSight: () => model.sight, ambientLight: () => model.ambient,
    lightReaches: () => model.reaches, seenSpots: () => spots, showsExplored: () => exploredMemoryOn(state.lighting), exploredSettling: () => false,
  };
  return playerLightingOf(view, perception);
}

/** A lit scene's lighting with nothing in it: everyone sees all in daylight, no token is seen; `overrides` replace any part. */
export function fixtureLighting(overrides: Partial<PlayerLighting> = {}): PlayerLighting {
  return {
    ready: true, perception: () => 'unseen', sight: SEES_ALL, ambient: { ambient: 1 }, reaches: [], spots: [], showsExplored: false, exploredSettling: false,
    ...overrides,
  };
}

export function wall(id: string, p1: { x: number; y: number }, p2: { x: number; y: number }): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1, p2 };
}

/** A light dim to `dim` feet (bright to half of it). */
export function light(id: string, x: number, y: number, dim = 10): LightSource {
  return { id, kind: 'light', x, y, emission: { bright: dim / 2, dim, color: '#ffcc88', intensity: 1, animation: 'none' } };
}

export const MAP: MapSize = { width: 1000, height: 800 };

/** Explored memory over the whole map, explored where `explored(x, y)` says (in map pixels), one texel per 10 px. */
export function exploredImage(map: MapSize, explored: (x: number, y: number) => boolean): ExploredImage {
  const width = Math.ceil(map.width / 10);
  const height = Math.ceil(map.height / 10);
  const coverage = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) coverage[y * width + x] = explored(x * 10 + 5, y * 10 + 5) ? 255 : 0;
  }
  return { width, height, coverage };
}

/** Explored memory of the right half of `MAP`. */
export function fixtureExploredImage(): ExploredImage {
  return exploredImage(MAP, (x) => x > MAP.width / 2);
}
const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 };

export type Scene = LitState & { exploredMask: string | null };

export function character(id: string, x: number, y: number, overrides: Partial<Character> = {}): Character {
  return { id, kind: 'character', x, y, imagePath: `art/${id}.png`, name: id, size: 1, ...overrides };
}

/** A lit scene: the hero sees (vision on), the others do not. */
export function scene(lighting: Partial<SceneLighting>, objects: Partial<Scene['objects']> = {}): Scene {
  return {
    grid: GRID,
    objects: {
      tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) },
      fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, lightZones: {}, audios: {},
      ...objects,
    },
    lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true, ...lighting },
    heldTokens: {},
    exploredMask: null,
  };
}
