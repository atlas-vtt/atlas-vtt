import type { SensedMark } from '../protocol/index.ts';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import type { FogCoverage } from '../../fog/fogCoverage';
import { levelObjects } from '../../levels/levelObjects';
import { levelForeground } from '../../levels/levelEdits';
import { levelMapKey, viewedLevelId } from '../../levels/sceneLevels';
import { heldForSight } from '../../lighting/sightOnDrop';
import { playerDoorSight, playerPointSight } from '../../pixi/lighting/playerLightingLayers';
import { shownRollTokens } from '../../pixi/playerRollTokens';
import type { ShownRollToken } from '../../services/playerRollSource';
import { mapTokens } from '../../tokens/offMap';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { SceneModelBuilder, type SceneModel } from '../../vision/sceneModel';
import { PerceptionMemo, tokenPerception, type TokenPerception } from '../../vision/tokenPerception';
import { PLAYER_SIGHT_POLICY } from '../../vision/tokenSightPolicy';
import { isLit, type LightingSource } from './atlasLighting.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { PlayerTokenSource, SceneState } from './atlasView.ts';
import type { MapSize } from './moveCheck.ts';
import { roundPlace } from './scenePicture.ts';

/** The world sight without a range reaches over where the floor's map size is not known. */
const UNKNOWN_MAP: MapSize = { width: 8192, height: 8192 };

/** What a floor's picture is worked out from besides the store. */
export interface FloorSightPorts {
  /** The floor's state: the shared scene with this floor shown. */
  state(): SceneState;
  /** The size of the floor's map, or null while it is not known. */
  map(): MapSize | null;
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
}

/** The lighting as the door and pin rules read it, from a model worked out here. */
interface ModelLighting {
  isEnabled(): boolean;
  currentSight: () => SceneModel['sight'];
  ambientLight: () => SceneModel['ambient'];
  lightReaches: () => SceneModel['reaches'];
}

/**
 * The players' picture of a floor the GM's view does not show, worked out on the CPU as Atlas's own
 * lighting works it out (`SceneModelBuilder`, `tokenPerception`) with the floor's committed fog: which
 * tokens they see or only sense, which doors and points of the map they see. A floor with a roof is
 * read failing closed, since the roof's pieces are known only where the GM's view draws it: players
 * see their own party's tokens there and nothing else of what a roof could hide.
 */
export class FloorSight {
  private readonly builder = new SceneModelBuilder({ reflectedLight: false });
  private readonly memo = new PerceptionMemo();
  private readonly fog = new FogCoverageCache();

  constructor(private readonly ports: FloorSightPorts) {}

  /** The tokens of the floor players see, among `tokenIds` (all without), as Atlas's player frame names them. */
  shownTokens(tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    const state = this.ports.state();
    if (state.mapPath === null) return new Map();
    const tokens = mapTokens(levelObjects(state));
    return shownRollTokens(state, state.mapPath, tokens, () => this.perception(state), tokenIds);
  }

  /** The doors players see now: in sight, their middle under no fog; none on a roofed floor or while the scene is unlit. */
  doorsSeen(walls: Readonly<Record<string, WallSegment>>, fog: FogCoverage | null): ReadonlySet<string> | null {
    const lighting = this.lighting();
    if (lighting === null) return null;
    return this.roofed() ? new Set() : playerDoorSight(lighting, { ...walls }, fog);
  }

  /** Which of `points` the players' picture shows now (the doors' rule); none on a roofed floor. */
  pointsSeen(points: readonly Point[], fog: FogCoverage | null): boolean[] | null {
    const lighting = this.lighting();
    if (lighting === null) return null;
    return this.roofed() ? points.map(() => false) : playerPointSight(lighting, points, fog);
  }

  /** The tokens players only sense now, as outlines of `cell`-sized tokens; none on a roofed floor. */
  sensed(cell: number): SensedMark[] | null {
    const state = this.ports.state();
    if (this.lighting() === null) return null;
    if (this.roofed()) return [];
    const perception = this.perception(state);
    if (perception === undefined) return [];
    return Object.entries(mapTokens(levelObjects(state))).flatMap(([id, token]) => {
      if (token.isHidden === true || perception(id) !== 'sensed' || !Number.isFinite(token.x) || !Number.isFinite(token.y)) return [];
      const size = typeof token.size === 'number' && token.size > 0 && Number.isFinite(token.size) ? token.size : 1;
      return [{ x: roundPlace(token.x), y: roundPlace(token.y), size: size * cell }];
    });
  }

  /** How the players perceive each token of the floor: by its lighting where lit, under its committed fog, failing closed under a roof. */
  private perception(state: SceneState): TokenPerception | undefined {
    const objects = levelObjects(state);
    const tokens = mapTokens(objects);
    const sceneLit = isLit(state);
    const lighting = sceneLit ? this.lighting() : null;
    const rules = this.ports.lightingSource()?.rules();
    const lit = lighting === null ? undefined : tokenPerception(lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches(), { ...tokens }, { conditions: rules?.conditions ?? [], held: heldForSight(state) }, this.memo);
    // Lit, but its lighting cannot be read: nothing is seen
    if (sceneLit && lit === undefined) return () => 'unseen';
    const coverage = this.fog.get(objects.fog, levelMapKey(state.mapPath, state));
    const fogged = coverage === null || coverage.shape.length > 0;
    const roofed = this.roofed();
    if (!fogged && !roofed) return lit;
    return (id) => {
      const token = tokens[id];
      if (token === undefined || (fogged && (coverage === null || coverage.covers(token)))) return 'unseen';
      if (roofed && !PLAYER_SIGHT_POLICY.alwaysSeen(token)) return 'unseen';
      return lit?.(id) ?? 'seen';
    };
  }

  /** The floor's lighting worked out now, or null while the scene is unlit or its rules cannot be read. */
  private lighting(): ModelLighting | null {
    const state = this.ports.state();
    const source = this.ports.lightingSource();
    if (!isLit(state) || source === null) return null;
    const { model } = this.builder.update(state, this.ports.map() ?? UNKNOWN_MAP, () => source.measurement(), () => source.rules());
    return { isEnabled: () => true, currentSight: () => model.sight, ambientLight: () => model.ambient, lightReaches: () => model.reaches };
  }

  /** Whether the floor has a roof, which only the GM's view of it can tell players' tokens from. */
  private roofed(): boolean {
    const state = this.ports.state();
    return levelForeground(state, viewedLevelId(state)) !== null;
  }
}

/** The players' token source of a floor the GM's view does not show: its picture worked out here, the grid the GM's own. */
export function floorTokenSource(sight: FloorSight, base: PlayerTokenSource | null): PlayerTokenSource | null {
  if (base === null) return null;
  return {
    playerRollTokens: (_mapPath, tokenIds) => sight.shownTokens(tokenIds),
    getGridOptions: () => base.getGridOptions(),
  };
}

/** The map layers' source of a floor the GM's view does not show: doors, points and sensed tokens worked out here, the grid and rules the GM's own. */
export function floorLayerSource(sight: FloorSight, base: MapLayerSource | null, cell: () => number): MapLayerSource | null {
  if (base === null) return null;
  return {
    grid: () => base.grid(),
    rules: () => base.rules(),
    doorsSeen: (walls, fog) => sight.doorsSeen(walls, fog),
    pointsSeen: (points, fog) => sight.pointsSeen(points, fog),
    sensed: () => sight.sensed(cell()),
  };
}
