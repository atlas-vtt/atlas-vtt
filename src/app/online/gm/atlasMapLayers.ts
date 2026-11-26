import type { App } from 'obsidian';
import type { SensedMark } from '../protocol/index.ts';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { GridOptions } from '../../grid/GridSystem';
import { playerDoorSight, playerPointSight } from '../../pixi/lighting/playerLightingLayers';
import type { SceneLightingView } from '../../pixi/lighting/sceneLightingView';
import { PlayedRules } from '../../campaigns/playedRules';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { systemPresetsOf } from '../../services/mapCollectionRules';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { CollectionLookup, RulesLookup } from '../../gameSystems/mapRules';
import type { TokenEntity } from '../../types';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import type { TokenPerception } from '../../vision/tokenPerception';
import { MapController } from '../../MapController';
import { field } from './atlasLighting.ts';
import { call, type SceneState } from './atlasView.ts';
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

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

/** A renderer's lighting controller (`lighting`, private) and the controller's view of the scene (`renderer`), unchecked. */
function lightingOf(renderer: unknown): { readonly controller: unknown; readonly view: unknown } {
  const controller = field(renderer, 'lighting');
  return { controller, view: field(controller, 'renderer') };
}

/** The lighting controller of a renderer (the GM's view): its view of the scene and the players' sight. */
function controllerOf(renderer: unknown): { view: SceneLightingView; playerSight: () => TokenPerception | undefined } | null {
  const { controller, view } = lightingOf(renderer);
  const playerSight = field(controller, 'playerSight');
  if (!isFunction(playerSight) || !isFunction(field(view, 'currentSight')) || !isFunction(field(view, 'sightIsCurrent'))) return null;
  const lighting = view as SceneLightingView;
  if (!lighting.isEnabled() || !lighting.sightIsCurrent()) return null;
  return { view: lighting, playerSight: () => (playerSight as () => TokenPerception | undefined).call(controller) };
}

/** The players' frame of a renderer (its token renderer's `playerFramePerception`: committed fog, the roof drawn) and that token renderer, or null without the frame. */
function playerFrameOf(renderer: unknown): { readonly frame: (lit?: TokenPerception) => TokenPerception | undefined; readonly tokens: unknown } | null {
  const tokens = call(renderer, 'getTokenRenderer');
  const perception = field(tokens, 'playerFramePerception');
  return isFunction(perception) ? { frame: (lit) => (perception as (sight?: TokenPerception) => TokenPerception | undefined).call(tokens, lit), tokens } : null;
}

/** A sprite's place and diameter as the token renderer holds it. */
function spritePlace(sprite: unknown): SensedMark | null {
  const x = field(sprite, 'x');
  const y = field(sprite, 'y');
  const size = field(sprite, 'tokenSize');
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: roundPlace(x), y: roundPlace(y), size: typeof size === 'number' && size > 0 && Number.isFinite(size) ? size : DEFAULT_TOKEN_SIZE };
}

/**
 * The map layers' source of an Atlas tab's renderer and view, read anew at each call: the
 * renderer's grid, its lighting controller (`lighting`, private, duck-typed: lit scenes only)
 * and token renderer (`playerFramePerception`, `getTokenSprites`), and the view's
 * asset service (`serviceManager.getAssetService`).
 */
export function mapLayerSourceOf(renderer: unknown, view: unknown): MapLayerSource {
  return {
    grid: () => (call(renderer, 'getGridOptions') as GridOptions | null | undefined) ?? null,
    doorsSeen: (walls, fog) => {
      const lighting = controllerOf(renderer);
      return lighting === null ? null : playerDoorSight(lighting.view, { ...walls }, fog);
    },
    pointsSeen: (points, fog) => {
      const lighting = controllerOf(renderer);
      return lighting === null ? null : playerPointSight(lighting.view, points, fog);
    },
    sightParts: () => {
      const lighting = controllerOf(renderer);
      return lighting === null ? null : [lighting.view.currentSight(), lighting.view.ambientLight(), lighting.view.lightReaches()];
    },
    sensed: (tokens) => {
      const lighting = controllerOf(renderer);
      const players = playerFrameOf(renderer);
      const sprites = call(players?.tokens, 'getTokenSprites');
      if (lighting === null || players === null || typeof sprites !== 'object' || sprites === null) return null;
      const perception = players.frame(lighting.playerSight());
      if (perception === undefined) return [];
      return Object.entries(tokens).flatMap(([id, token]) => {
        if (token.isHidden === true || perception(id) !== 'sensed') return [];
        const place = spritePlace(field(sprites, id));
        return place === null ? [] : [place];
      });
    },
    rules: () => rulesLookupOf(view),
    presets: () => presetsOf(view),
  };
}

/** The sprites of a renderer's tokens by id, or none while it has no token renderer. */
function spritesOf(tokenRenderer: unknown): Readonly<Record<string, object | null>> {
  const sprites = call(tokenRenderer, 'getTokenSprites');
  return typeof sprites === 'object' && sprites !== null ? (sprites as Readonly<Record<string, object | null>>) : {};
}

/**
 * The renderer of the GM's view as the basis a player's own picture of the level it shows is cut from
 * (`EyesSight`), read anew at each call: its lighting's sight, the players' frame of its token renderer
 * (`playerFramePerception`: committed fog, the roof drawn) and its sprites. Null for a renderer without
 * that frame.
 */
export function pictureBasisOf(renderer: unknown): PictureBasis | null {
  const players = playerFrameOf(renderer);
  if (players === null) return null;
  return {
    lighting: () => {
      const lighting = controllerOf(renderer);
      return lighting === null ? null : { sight: lighting.view.currentSight(), ambient: lighting.view.ambientLight(), reaches: lighting.view.lightReaches() };
    },
    frame: (lit) => players.frame(lit),
    roofed: () => false,
    drawn: () => spritesOf(players.tokens),
    outline: (tokenId) => spritePlace(field(spritesOf(players.tokens), tokenId)),
  };
}

/**
 * Where an Atlas view looks up a map's rules: its asset service for the map's collection and its
 * settings, and its app for the campaign being played; null when it has no asset service.
 */
export function rulesLookupOf(view: unknown): RulesLookup | null {
  const assets = call(field(view, 'serviceManager'), 'getAssetService');
  if (!isFunction(field(assets, 'getCollectionForMap')) || !isFunction(field(assets, 'getCollectionSettings'))) return null;
  const collections = assets as CollectionLookup;
  const app = field(view, 'app');
  return {
    getCollectionForMap: (mapPath) => collections.getCollectionForMap(mapPath),
    getCollectionSettings: (collectionId) => collections.getCollectionSettings(collectionId),
    playedSystem: () => (typeof app === 'object' && app !== null ? PlayedRules.forApp(app)?.played() ?? null : null),
  };
}

/** The game system presets of an Atlas view's app (`systemPresetsOf`); the built-in ones when it has no app. */
function presetsOf(view: unknown): readonly SystemPreset[] {
  const app = field(view, 'app');
  return typeof app === 'object' && app !== null ? systemPresetsOf(app as App) : BUILT_IN_SYSTEM_PRESETS;
}

/**
 * Whether the renderer's picture is of the level its view shows now: that level's map image has
 * loaded and its lighting's sight is the scene's (`sightIsCurrent`). After the GM switches levels both
 * take a moment; until then the players' picture of that level is worked out without the renderer.
 */
export function showsViewedLevel(renderer: unknown, state: SceneState): boolean {
  const lighting = lightingOf(renderer).view;
  const current = field(lighting, 'sightIsCurrent');
  if (typeof current === 'function' && (current as () => boolean).call(lighting) !== true) return false;
  const mapImage = call(renderer, 'getMapImage');
  return MapController.showsViewedLevel((mapImage ?? null) as Parameters<typeof MapController.showsViewedLevel>[0], state);
}
