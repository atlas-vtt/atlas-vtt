// Frozen from c2d0d849fbb09f316ca017a3fd2fa6bbb62274c3 src/app/online/gm/atlasMapLayers.ts. Only import paths are adapted.
import type { SensedMark } from '../../../src/app/online/protocol/index.ts';
import type { FogCoverage } from '../../../src/app/fog/fogCoverage';
import type { GridOptions } from '../../../src/app/grid/GridSystem';
import { playerDoorSight, playerPointSight } from '../../../src/app/pixi/lighting/playerLightingLayers';
import { PlayedRules } from '../../../src/app/campaigns/playedRules';
import { systemPresetsOf } from '../../../src/app/services/mapCollectionRules';
import type { SystemPreset } from '../../../src/app/types/systemPresetTypes';
import type { RulesLookup } from '../../../src/app/gameSystems/mapRules';
import type { TokenEntity } from '../../../src/app/types';
import type { Point } from '../../../src/app/types/visionTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { MapController } from '../../../src/app/MapController';
import type { SceneState } from '../../../src/app/online/gm/atlasView.ts';
import type { DrawnToken, MapCanvas, MapLighting, MapServices, MapView } from './mapView.ts';
import type { PictureBasis } from './eyesSight.ts';
import { roundPlace } from '../../../src/app/online/gm/scenePicture.ts';

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
  /** Which of `points` the players' picture of a lit scene shows now (the doors' rule, with the committed fog); null as for the doors. */
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

/** The canvas's lighting while its scene is lit and its sight is the scene's, else null. */
function currentLighting(canvas: MapCanvas): MapLighting | null {
  const lighting = canvas.getLightingController();
  return lighting !== null && lighting.renderer.isEnabled() && lighting.renderer.sightIsCurrent() ? lighting : null;
}

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
 * The map layers' source of an Atlas tab's canvas and view, read anew at each call: the canvas's grid, its
 * lighting (lit scenes only) and token renderer (the players' frame, the sprites), and the view's rules.
 */
export function mapLayerSourceOf(canvas: MapCanvas, view: RulesView): MapLayerSource {
  return {
    grid: () => canvas.getGridOptions(),
    doorsSeen: (walls, fog) => {
      const lighting = currentLighting(canvas);
      return lighting === null ? null : playerDoorSight(lighting.renderer, { ...walls }, fog);
    },
    pointsSeen: (points, fog) => {
      const lighting = currentLighting(canvas);
      return lighting === null ? null : playerPointSight(lighting.renderer, points, fog);
    },
    sightParts: () => {
      const lighting = currentLighting(canvas)?.renderer;
      return lighting === undefined ? null : [lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches()];
    },
    sensed: (tokens) => {
      const lighting = currentLighting(canvas);
      const players = canvas.getTokenRenderer();
      if (lighting === null || players === null) return null;
      const perception = players.playerFramePerception(lighting.playerSight());
      if (perception === undefined) return [];
      const sprites = players.getTokenSprites();
      return Object.entries(tokens).flatMap(([id, token]) => {
        if (token.isHidden === true || perception(id) !== 'sensed') return [];
        const place = spritePlace(spriteOf(sprites, id));
        return place === null ? [] : [place];
      });
    },
    rules: () => rulesLookupOf(view),
    presets: () => systemPresetsOf(view.app),
  };
}

/**
 * The canvas of the GM's view as the basis a player's own picture of the level it shows is cut from
 * (`EyesSight`), read anew at each call: its lighting's sight, the players' frame of its token renderer
 * (committed fog, the roof drawn) and its sprites. Null for a canvas without a token renderer.
 */
export function pictureBasisOf(canvas: MapCanvas): PictureBasis | null {
  const players = canvas.getTokenRenderer();
  if (players === null) return null;
  return {
    lighting: () => {
      const lighting = currentLighting(canvas)?.renderer;
      return lighting === undefined ? null : { sight: lighting.currentSight(), ambient: lighting.ambientLight(), reaches: lighting.lightReaches() };
    },
    frame: (lit) => players.playerFramePerception(lit),
    roofed: () => false,
    drawn: () => players.getTokenSprites(),
    outline: (tokenId) => spritePlace(spriteOf(players.getTokenSprites(), tokenId)),
  };
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
