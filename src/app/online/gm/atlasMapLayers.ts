import type { SensedMark } from '../protocol/index.ts';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { GridOptions } from '../../grid/GridSystem';
import { PlayedRules } from '../../campaigns/playedRules';
import { systemPresetsOf } from '../../services/mapCollectionRules';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { RulesLookup } from '../../gameSystems/mapRules';
import type { TokenEntity } from '../../types';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { MapController } from '../../MapController';
import type { SceneState } from './atlasView.ts';
import type { DrawnToken, MapCanvas, MapServices, MapView } from './mapView.ts';
import type { PictureBasis } from './eyesSight.ts';
import { roundPlace } from './scenePicture.ts';

/** Atlas's default token diameter, which the players' outlines take for a sprite that names none. */
const DEFAULT_TOKEN_SIZE = 70;

/** What the companion reads of an Atlas tab for the map layers players see beside the tokens. */
export interface MapLayerSource {
  /** The options of the tab's grid, or null while it has none. */
  grid(): Readonly<GridOptions> | null;
  /**
   * The doors the players see now (`playerDoorSight`, with the committed fog), or null while the
   * scene's lighting cannot be read or its sight is not yet the scene's.
   */
  doorsSeen(walls: Readonly<Record<string, WallSegment>>, fog: FogCoverage | null): ReadonlySet<string> | null;
  /**
   * Which of `points` the players' picture shows the map at now: a lit scene's sight by the doors' rule, an unlit
   * scene wherever committed fog does not cover them (fog that cannot be read covers all); null as for the doors.
   */
  pointsSeen(points: readonly Point[], fog: FogCoverage | null): boolean[] | null;
  /**
   * What the players' sight is worked out from now (its sight, its ambient light, its lights'
   * reaches), each the same object while it is the same: while all are, `pointsSeen` answers as it
   * did. Null while the lighting cannot be read; without it, whoever asks cannot tell.
   */
  sightParts?(): readonly unknown[] | null;
  /** The tokens the players only sense now, where their frame outlines them; null as for the doors. */
  sensed(tokens: Readonly<Record<string, TokenEntity>>): SensedMark[] | null;
  /** Where the map's rules are looked up (Atlas's asset service and the played campaign), or null. */
  rules(): RulesLookup | null;
  /** The game system presets the map's rules may name (`systemPresetsOf`): the built-in ones, and the user's. */
  presets(): readonly SystemPreset[];
}

/** What the map layers read of a map view: where its map's rules are looked up. */
type RulesView = Pick<MapView, 'app'> & { readonly serviceManager: Pick<MapServices, 'getAssetService'> };

/** A sprite's place and diameter as the token renderer holds it. */
function spritePlace(sprite: DrawnToken | null | undefined): SensedMark | null {
  if (sprite === undefined || sprite === null) return null;
  const { x, y, tokenSize: size } = sprite;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: roundPlace(x), y: roundPlace(y), size: size > 0 && Number.isFinite(size) ? size : DEFAULT_TOKEN_SIZE };
}

/** The sprite of a token, or none for one the token renderer does not draw. */
const spriteOf = (sprites: Readonly<Record<string, DrawnToken | null>>, tokenId: string): DrawnToken | null | undefined => (Object.hasOwn(sprites, tokenId) ? sprites[tokenId] : undefined);

/**
 * The map layers' source of an Atlas tab's canvas and view, read anew at each call: the canvas's grid, what its players'
 * frame shows (`MapCanvas.playersPerception`: doors, places and the tokens players only sense, outlined where their
 * sprites stand), and the view's rules.
 */
export function mapLayerSourceOf(canvas: MapCanvas, view: RulesView): MapLayerSource {
  return {
    grid: () => canvas.getGridOptions(),
    doorsSeen: (walls, fog) => canvas.playersPerception().doors(canvas.sightSource(), walls, fog),
    pointsSeen: (points, fog) => canvas.playersPerception().places(canvas.sightSource(), points, fog),
    sightParts: () => canvas.playersPerception().sightParts(canvas.sightSource()),
    sensed: (tokens) => {
      const sensed = canvas.playersPerception().sensed(canvas.sightSource(), tokens);
      const sprites = canvas.getTokenRenderer()?.getTokenSprites() ?? {};
      return sensed?.flatMap((id) => spritePlace(spriteOf(sprites, id)) ?? []) ?? null;
    },
    rules: () => rulesLookupOf(view),
    presets: () => systemPresetsOf(view.app),
  };
}

/**
 * The canvas of the GM's view as the basis a player's own picture of the level it shows is cut from (`EyesSight`):
 * the canvas as the source of the players' picture, with its sprites as the outlines' places. Null for a canvas
 * without a token renderer.
 */
export function pictureBasisOf(canvas: MapCanvas): PictureBasis | null {
  const players = canvas.getTokenRenderer();
  if (players === null) return null;
  return { ...canvas.sightSource(), outline: (tokenId) => spritePlace(spriteOf(players.getTokenSprites(), tokenId)) };
}

/**
 * Where an Atlas view looks up a map's rules: its asset service for the map's collection and its
 * settings, and its app for the campaign being played; null while it has no asset service.
 */
function rulesLookupOf(view: RulesView): RulesLookup | null {
  const collections = view.serviceManager.getAssetService();
  if (collections === null) return null;
  return {
    getCollectionForMap: (mapPath) => collections.getCollectionForMap(mapPath),
    getCollectionSettings: (collectionId) => collections.getCollectionSettings(collectionId),
    playedSystem: () => PlayedRules.forApp(view.app)?.played() ?? null,
  };
}

/**
 * Whether the canvas's picture is of the level its view shows now: that level's map image has loaded and
 * its lighting's sight is the scene's. After the GM switches levels both take a moment; until then the
 * players' picture of that level is worked out without the canvas.
 */
export function showsViewedLevel(canvas: MapCanvas, state: SceneState): boolean {
  const lighting = canvas.getLightingController();
  if (lighting !== null && !lighting.renderer.sightIsCurrent()) return false;
  return MapController.showsViewedLevel(canvas.getMapImage(), state);
}
