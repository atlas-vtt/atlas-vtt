import type { SensedMark } from '../protocol/index.ts';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { GridOptions } from '../../grid/GridSystem';
import { playerDoorSight, playerPointSight } from '../../pixi/lighting/playerLightingLayers';
import type { SceneLightingView } from '../../pixi/lighting/sceneLightingView';
import { PlayedRules } from '../../campaigns/playedRules';
import type { CollectionLookup, RulesLookup } from '../../gameSystems/mapRules';
import type { TokenEntity } from '../../types';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import type { TokenPerception } from '../../vision/tokenPerception';
import { field } from './atlasLighting.ts';
import { call } from './atlasView.ts';
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
  /** The tokens the players only sense now, where their frame outlines them; null as for the doors. */
  sensed(tokens: Readonly<Record<string, TokenEntity>>): SensedMark[] | null;
  /** Where the map's rules are looked up (Atlas's asset service and the played campaign), or null. */
  rules(): RulesLookup | null;
}

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

/** The lighting controller of a renderer (the GM's view): its view of the scene and the players' sight. */
function controllerOf(renderer: unknown): { view: SceneLightingView; playerSight: () => TokenPerception | undefined } | null {
  const controller = field(renderer, 'lighting');
  const view = field(controller, 'renderer');
  const playerSight = field(controller, 'playerSight');
  if (!isFunction(playerSight) || !isFunction(field(view, 'currentSight')) || !isFunction(field(view, 'sightIsCurrent'))) return null;
  const lighting = view as SceneLightingView;
  if (!lighting.isEnabled() || !lighting.sightIsCurrent()) return null;
  return { view: lighting, playerSight: () => (playerSight as () => TokenPerception | undefined).call(controller) };
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
    sensed: (tokens) => {
      const lighting = controllerOf(renderer);
      const tokenRenderer = call(renderer, 'getTokenRenderer');
      const framePerception = field(tokenRenderer, 'playerFramePerception');
      const sprites = call(tokenRenderer, 'getTokenSprites');
      if (lighting === null || !isFunction(framePerception) || typeof sprites !== 'object' || sprites === null) return null;
      const perception = (framePerception as (sight?: TokenPerception) => TokenPerception | undefined).call(tokenRenderer, lighting.playerSight());
      if (perception === undefined) return [];
      return Object.entries(tokens).flatMap(([id, token]) => {
        if (token.isHidden === true || perception(id) !== 'sensed') return [];
        const place = spritePlace(field(sprites, id));
        return place === null ? [] : [place];
      });
    },
    rules: () => rulesLookupOf(view),
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
