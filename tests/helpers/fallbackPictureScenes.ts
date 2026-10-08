import type { Renderer } from 'pixi.js';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { MapBounds } from '../../src/app/vision/visibility';
import { KINDS, openPictures, type Kind, type Pictures, type Tallies } from './fallbackPictures';
import { sightScene } from './sightScenes';

/** 70 px cells of 5 ft: 14 px to the foot. */
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
export const CLEAN = { canvas: { leaked: 0, lost: 0, beyond: 0 }, webgl: { leaked: 0, lost: 0, beyond: 0 } };

export function token(id: string, x: number, y: number, vision: TokenEntity['vision'] = { enabled: true }): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision };
}

export function wall(id: string, p1: Point, p2: Point): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1, p2 };
}

export function byId<T extends { id: string }>(list: readonly T[] = []): Record<string, T> {
  return Object.fromEntries(list.map((item) => [item.id, item]));
}

/** What must be none in a view: pixels shown that are hidden, and black without a cause or beyond the map. */
export function faults(tallies: Tallies): typeof CLEAN {
  const of = ({ leaked, lost, beyond }: Tallies[Kind]): (typeof CLEAN)[Kind] => ({ leaked, lost, beyond });
  return { canvas: of(tallies.canvas), webgl: of(tallies.webgl) };
}

/** The faults of several views, added up. */
export function sumOf(list: readonly Tallies[]): typeof CLEAN {
  const sum = structuredClone(CLEAN);
  for (const tallies of list) {
    for (const kind of KINDS) {
      sum[kind].leaked += tallies[kind].leaked;
      sum[kind].lost += tallies[kind].lost;
      sum[kind].beyond += tallies[kind].beyond;
    }
  }
  return sum;
}

/** What a scene written out by hand holds. */
export interface CustomScene {
  tokens: TokenEntity[];
  walls?: WallSegment[];
  lights?: LightSource[];
}

/** A scene written out by hand, lit and dark, through both renderers; its store, to change it. */
export function customPictures(renderers: Record<Kind, Renderer>, bounds: MapBounds, scene: CustomScene): Pictures & { store: ViewAtlasStore } {
  const store = createViewAtlasStore(createInMemoryApp().app, `fallback-picture-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState((state) => ({ objects: { ...state.objects, tokens: byId(scene.tokens), walls: byId(scene.walls), lights: byId(scene.lights) } }));
  store.getState().setSceneLighting({ enabled: true, ambient: 0 });
  return { ...openPictures(renderers, { store, measurement: () => MEASUREMENT, bounds }), store };
}

/** A seeded scene of the sight sweeps through both renderers. */
export function seededPictures(renderers: Record<Kind, Renderer>, seed: number): Pictures {
  const scene = sightScene(seed);
  const store = createViewAtlasStore(createInMemoryApp().app, `fallback-picture-${seed}`);
  const { state } = scene;
  store.setState({ persistenceEnabled: false, grid: state.grid, lighting: state.lighting, heldTokens: state.heldTokens, objects: { ...store.getState().objects, ...state.objects } });
  return openPictures(renderers, { store, measurement: scene.measurement, rules: () => scene.rules, bounds: scene.bounds });
}
