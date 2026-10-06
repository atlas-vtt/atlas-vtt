// Frozen from 3c23746a6f54b67b442646ea8ff912c914c2447a src/app/pixi/lighting/sceneModel.ts. Only import paths are adapted.
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { sleeps } from '../../../src/app/lighting/lightActivity';
import { lightZoneList, withZones } from '../../../src/app/lighting/lightZones';
import { worldTexel } from '../../../src/app/lighting/lightingConstants';
import { unitScaleOf } from '../../../src/app/lighting/lightingUnits';
import { sealedWalls } from '../../../src/app/lighting/sealWalls';
import { SightTokens, heldForSight } from '../../../src/app/lighting/sightOnDrop';
import type { HeldTokens } from '../../../src/app/types/viewUIState';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import type { TokenEntity } from '../../../src/app/types';
import type { SceneLighting } from '../../../src/app/types/lightingTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { exploredShapes, type ExploredShapes } from '../../../src/app/vision/exploredShapes';
import { quenched, sourcesInDarkness } from '../../../src/app/vision/magicalDarkness';
import { seenSpots, type SeenSpot } from './perception';
import type { SightRules } from '../../../src/app/vision/sightRules';
import { ambientAt } from '../../../src/app/vision/lightLevels';
import { SightCache, sceneSight, sightOptionsChanged, sightSources, type AmbientLight, type LightReach, type Sight } from './sight';
import type { MapBounds } from '../../../src/app/vision/visibility';
import { wallList } from '../../../src/app/vision/wallList';
import type { EngineLight, EngineZone } from '../../../src/app/pixi/lighting/engine/types';
import { LightReaches } from '../../../src/app/pixi/lighting/lightReaches';
import { activeLights, engineLight } from '../../../src/app/pixi/lighting/lightSources';

/** What a scene's lighting works out on the CPU, in world pixels: the engine draws it and the rules read it. */
export interface SceneModel {
  /** The drawn walls followed by the bridges that close their joints (`sealedWalls`). */
  walls: readonly WallSegment[];
  lights: EngineLight[];
  reaches: LightReach[];
  sight: Sight;
  /** What the tokens see now, for explored memory to record; null when nothing is recorded. */
  explored: ExploredShapes | null;
  /** The scene's ambient zones as the engine draws them; the same list while the zones stay. */
  zones: readonly EngineZone[];
  /** The ambient light as the rules read it: the scene's lighting itself, or with its zones when it has any. */
  ambient: AmbientLight;
}

type SceneState = Pick<ViewAtlasState, 'objects' | 'lighting' | 'grid' | 'heldTokens'>;

interface Built {
  walls: ViewAtlasState['objects']['walls'];
  lights: ViewAtlasState['objects']['lights'];
  zones: ViewAtlasState['objects']['lightZones'];
  tokens: Record<string, TokenEntity>;
  grid: ViewAtlasState['grid'];
  lighting: SceneLighting;
  rules: SightRules | undefined;
  model: SceneModel;
}

/**
 * A scene's lights, their reaches and its sight, worked out from the store and again only when
 * what they are built from changes: the walls, the placed lights, the light zones, the grid, the sight options,
 * an ambient light that wakes or puts out a light that follows it,
 * the sight rules of the map's collection and the tokens as sight and light read them (`SightTokens`: a dragged token stands where its
 * drag began until the drop, so a drag builds nothing).
 */
export class SceneModelBuilder {
  private readonly sightTokens = new SightTokens();
  private readonly sightCache = new SightCache();
  private readonly lightReaches = new LightReaches();
  private built: Built | null = null;

  /** The model of `state`, and whether this call built it anew. */
  update(state: SceneState, bounds: MapBounds, measurement: () => MeasurementSettings, sightRules?: () => SightRules): { model: SceneModel; rebuilt: boolean } {
    const { walls, lights, lightZones: zones } = state.objects;
    const { grid, lighting } = state;
    const tokens = this.sightTokens.read(state);
    const rules = sightRules?.();
    const last = this.built;
    if (last && last.walls === walls && last.lights === lights && last.zones === zones && last.tokens === tokens && last.grid === grid && last.rules === rules) {
      const same = !sightOptionsChanged(last.lighting, lighting) && !awakeLightsChanged(lights, withZones(last.lighting, lightZoneList(zones)), withZones(lighting, lightZoneList(zones)));
      // The lighting is noted either way: the next update compares with it, not with an older one.
      last.lighting = lighting;
      if (same) return { model: last.model, rebuilt: false };
    }
    const model = this.build(state, tokens, bounds, measurement(), rules);
    this.built = { walls, lights, zones, tokens, grid, lighting, rules, model };
    return { model, rebuilt: true };
  }

  /** The next update builds anew, whatever changed: the map's size did, or lighting was off meanwhile. */
  reset(): void {
    this.built = null;
  }

  private build(state: SceneState, tokens: Record<string, TokenEntity>, bounds: MapBounds, measurement: MeasurementSettings, rules: SightRules | undefined): SceneModel {
    const scale = unitScaleOf(measurement, state.grid);
    const walls = sealedWalls(wallList(state.objects.walls), worldTexel(bounds));
    const zoneList = lightZoneList(state.objects.lightZones);
    const ambient = withZones(state.lighting, zoneList);
    const shining = activeLights(state.objects.lights, tokens, ambient).map((light) => engineLight(light, scale));
    const everyReach = this.lightReaches.sync(shining, walls);
    // A light whose flame stands in magical darkness it does not outshine gives nothing: the picture and the rule both leave it out.
    const out = shining.map((light) => !light.darkness && quenched(light, light.priority ?? 0, everyReach));
    // A darkness is drawn as the polygon the rule counts, and veils the light it swallows where the
    // rule counts that light: the reaches' polygons, handed on rather than traced again.
    const dark = shining.some((light) => light.darkness);
    const lights = shining.flatMap((light, i) => (out[i] ? [] : [dark ? { ...light, area: everyReach[i]!.polygon } : light]));
    const reaches = everyReach.filter((_, i) => !out[i]);
    const sight = sceneSight(state.lighting, sourcesInDarkness(sightSources(tokens, scale, bounds, rules), ambient, reaches), walls, this.sightCache);
    // Half a cell: the width of a zone's soft edge past its outline.
    const zones = zoneList.map(({ polygon, ambient: level, ambientColor }) => ({ polygon, ambient: level, ...(ambientColor && { ambientColor }), soft: scale.cellSize / 2 }));
    return { walls, lights, reaches, sight, explored: exploredShapes(sight, ambient, reaches), zones: zones.length > 0 ? zones : NO_ZONES, ambient };
  }
}

const NO_ZONES: readonly EngineZone[] = [];

/** Whether a light that follows the ambient light wakes or falls asleep between two ambient lights. */
function awakeLightsChanged(lights: ViewAtlasState['objects']['lights'], before: AmbientLight, after: AmbientLight): boolean {
  if (before.ambient === after.ambient) return false;
  for (const id in lights) {
    const light = lights[id]!;
    if (sleeps(light, ambientAt(light, before)) !== sleeps(light, ambientAt(light, after))) return true;
  }
  return false;
}

interface SpotInputs {
  model: SceneModel;
  tokens: Record<string, TokenEntity>;
  held: HeldTokens;
  lighting: SceneLighting;
  grid: ViewAtlasState['grid'];
  rules: SightRules | undefined;
}

/**
 * The tokens shown within their footprint where the picture is dark (`seenSpots`). They are
 * read where the store has them, not where a drag began: a party token dragged through the
 * dark is shown along the way, as far as the sight that stayed behind reaches. Worked out only
 * when the model, the tokens, the held tokens, the lighting or the rules change, and the same
 * list is returned while its spots stay the same, so a view that compares lists draws nothing anew.
 */
export class SceneSpots {
  private inputs: SpotInputs | null = null;
  private spots: SeenSpot[] = [];

  update(model: SceneModel, state: SceneState, measurement: () => MeasurementSettings, sightRules?: () => SightRules): SeenSpot[] {
    const inputs: SpotInputs = { model, tokens: state.objects.tokens, held: heldForSight(state), lighting: state.lighting, grid: state.grid, rules: sightRules?.() };
    const last = this.inputs;
    this.inputs = inputs;
    if (last && (Object.keys(inputs) as (keyof SpotInputs)[]).every((key) => last[key] === inputs[key])) return this.spots;
    const { cellSize } = unitScaleOf(measurement(), state.grid);
    const spots = seenSpots(model.sight, withZones(state.lighting, model.ambient.zones ?? []), model.reaches, inputs.tokens, cellSize, model.walls, { conditions: inputs.rules?.conditions ?? [], held: inputs.held });
    // The footprints are cut by the walls: with other walls they are other footprints at the same places.
    if (last?.model.walls !== model.walls || !sameSpots(spots, this.spots)) this.spots = spots;
    return this.spots;
  }
}

function sameSpots(a: readonly SeenSpot[], b: readonly SeenSpot[]): boolean {
  return a.length === b.length && a.every((spot, i) => spot.x === b[i]!.x && spot.y === b[i]!.y && spot.radius === b[i]!.radius);
}
