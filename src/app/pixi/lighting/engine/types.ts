import type { Texture } from 'pixi.js';
import type { LightAnimation, SceneLighting } from '../../../types/lightingTypes';
import type { WallSegment } from '../../../types/wallTypes';
import type { SeenSpot } from '../../../vision/perception';
import type { Sight } from '../../../vision/sight';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import type { VisionCone } from '../../../vision/visionCone';

/** A light in world pixels with its steady settings; colour is linear and already tinted. */
export interface EngineLight {
  key: string;
  x: number;
  y: number;
  bright: number;
  dim: number;
  /** Radius of the flame before placement clamps it. */
  flame: number;
  color: readonly [number, number, number];
  intensity: number;
  animation: LightAnimation;
  /** A source of magical darkness: it swallows light within `dim` instead of giving any. */
  darkness?: boolean;
  /** Which of a light and a darkness that meet wins (`LightEmission.priority`); unset is 0. */
  priority?: number;
  /** A light that shines one way: where it faces and how wide, with its own space around it (`apex`) lit all around. */
  cone?: VisionCone;
  /**
   * The area the rule counts for this light (its `LightReach`'s polygon), where one builder made
   * both (`SceneModelBuilder`): a darkness source is drawn as it, and a light's says where the
   * darkness swallows its light. Without it the engine works the area out the same way.
   */
  area?: Polygon;
  /** Width in world pixels of the soft edge past a beam's sides and far end (`softEdge`); unset, the fade past the dim radius. */
  edge?: number;
}

/** An area with ambient light of its own (`LightZone`), in world pixels; inside `polygon` the rule counts its level. */
export interface EngineZone {
  polygon: { x: number; y: number }[];
  ambient: number;
  ambientColor?: string;
  /** Width of its soft edge past the outline, where no wall is. */
  soft: number;
}

/**
 * Everything the engine lights, in world pixels, with the scene options the composite draws:
 * ambient light, and how the players' view shows what no token sees now (unset options keep
 * their defaults, which draw exactly as before the options existed).
 */
export interface EngineScene extends Pick<SceneLighting, 'ambientColor' | 'exploredMemory' | 'exploredColor' | 'unexploredColor' | 'litThreshold' | 'brightThreshold' | 'darkSightLook' | 'darkSightTint'> {
  bounds: MapBounds;
  /** The map image; bounce reads its colours (mid grey without one). */
  albedo: Texture | null;
  /** Sealed walls: the drawn walls followed by the bridges that close their joints (`sealedWalls`). */
  walls: readonly WallSegment[];
  lights: readonly EngineLight[];
  sight: Sight;
  /** Different sight for the local player frame; absent when both pictures share it. */
  playerSight?: Sight;
  /** The player frame's footprints where they differ from the GM's. */
  playerSpots?: readonly SeenSpot[];
  /** Tokens seen where no sense shows the map: each is shown within its footprint (`seenSpots`). */
  spots?: readonly SeenSpot[];
  /** Footprint radius of a vision token, for the soft edges of its sight. */
  sightRadius: number;
  ambient: number;
  /** The scene's ambient zones in their order, the same list while they stay; none draws exactly as before zones existed. */
  zones?: readonly EngineZone[];
}

/**
 * A render of the viewport outside the stage's, without its camera (`generateTexture`): world
 * point (x, y) is its first pixel, and `resolution` is its pixels per world pixel.
 */
export interface SceneFrame {
  x: number;
  y: number;
  resolution: number;
}
