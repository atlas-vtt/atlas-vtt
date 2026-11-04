import type { Texture } from 'pixi.js';
import type { LightAnimation, SceneLighting } from '../../../types/lightingTypes';
import type { WallSegment } from '../../../types/wallTypes';
import type { SeenSpot } from '../../../vision/perception';
import type { Sight } from '../../../vision/sight';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import type { VisionCone } from '../../../vision/visionCone';
import type { ReflectionPart } from '../../../vision/reflectedLight';

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
   * both (`SceneModelBuilder`): a darkness source is drawn as it, a light's says where the
   * darkness swallows its light, and the polygon picture draws every light as it. Without it the
   * engine works the area out the same way.
   */
  area?: Polygon;
  /** Width in world pixels of the soft edge inside a beam's sides at most (`softEdge`); unset, `softEdge` of its dim radius. */
  edge?: number;
  /**
   * A light that glows from a whole area (lava): its corners, at most `MAX_AREA_CORNERS`. Inside
   * it the light is bright; `bright` and `dim` count from its outline, and `x`, `y` are its middle.
   * Such a light has no cone and no flame of its own.
   */
  surface?: readonly { x: number; y: number }[];
  /** Where the rule counts an area light's light beyond its area (`LightReach.parts`), handed on with `area` where one builder made both. */
  parts?: readonly { origin: { x: number; y: number }; polygon: Polygon }[];
  /** Where its lit floor gives light back (`LightReach.reflection`), as the rule counts it; the same list while it stays. */
  reflection?: readonly ReflectionPart[];
  /**
   * The light is moving (`LightMotion`): its tile is traced with few rays and at once, wherever
   * the device stands, so it is drawn where it is in this frame, and the bounce waits for it to
   * rest. Once it rests it is built without this, in full.
   */
  moving?: true;
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
  /** The grid's cell in world px: the world textures' texel follows it (`pictureTexel`). Unset, the map's size alone decides. */
  cellSize?: number;
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
  /** The frame's size in world pixels; without one no level below is drawn into it. */
  width?: number;
  height?: number;
}
