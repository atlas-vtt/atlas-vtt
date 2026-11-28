import { cellNumberStyleOfGrid } from '../../../../src/app/grid/cellNumbering';
import { parseGridColor } from '../../../../src/app/grid/gridContrastColor';
import type { CollectionLookup } from '../../../../src/app/gameSystems/mapRules';
import { fogCoverage } from '../../../../src/app/fog/fogCoverage';
import type { TokenPerception } from '../../../../src/app/vision/tokenPerception';
import { PLAYER_SIGHT_POLICY } from '../../../../src/app/vision/tokenSightPolicy';
import { canvasSightSource, PlayersPerception } from '../../../../src/app/perception/playersPerception';
import type { MapBounds } from '../../../../src/app/vision/visibility';
import type { App } from 'obsidian';
import { NO_MOVEMENT_RULES } from '../../../../src/app/measure/movementRules';
import type { GridOptions } from '../../../../src/app/grid/GridSystem';
import type { DrawnToken, MapCanvas, MapLighting, MapServices, MapTokens, MapView } from '../../../../src/app/online/gm/mapView.ts';
import type { LightingSource } from '../../../../src/app/online/gm/atlasLighting.ts';
import { mapLayerSourceOf, type MapLayerSource } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { gmModel, gmPerception } from './gmLighting.ts';

/**
 * The options the GM's `GridSystem` holds for a scene's grid, as Atlas builds them from the store
 * (`GridController`) and follows its changes (`PixiRendererOrchestrator`'s grid subscription):
 * hiding the grid only switches it off (`enabled`), every other option stays.
 */
export function gmGridOptions(state: SceneState): Record<string, unknown> | null {
  const grid = state.grid;
  if (grid === null) return null;
  return {
    type: grid.type ?? 'square', size: grid.size, offsetX: grid.offsetX, offsetY: grid.offsetY, color: parseGridColor(grid.color), alpha: grid.opacity,
    lineWidth: grid.lineWidth ?? 1, lineType: grid.lineType ?? 'solid', cellNumbers: cellNumberStyleOfGrid(grid), enabled: grid.visible !== false,
  };
}

export interface FakeTabOptions {
  readonly state: () => SceneState;
  readonly source: LightingSource;
  readonly bounds: MapBounds;
  /** The grid's options as Atlas's `GridSystem` holds them. */
  readonly grid?: () => Record<string, unknown> | null;
  readonly collections?: CollectionLookup | null;
  /** The app the view belongs to, where the user's game system presets are found. */
  readonly app?: object;
  readonly tokenSize?: number;
  /** Whether the renderer has drawn the level its view shows (its lighting's `sightIsCurrent`); unset, it has. */
  readonly drawn?: () => boolean;
}

/**
 * A map view's canvas that draws nothing beyond `parts`: no lighting, token renderer, measure renderer, drawings or
 * viewport, and so no players' picture of its own (no lighting, no tokens drawn) unless `parts` gives one.
 */
export function fakeCanvas(parts: Pick<MapCanvas, 'playerRollTokens' | 'getGridOptions'> & Partial<MapCanvas>): MapCanvas {
  const unlit = canvasSightSource({ lighting: () => null, tokens: () => null });
  const party = new PlayersPerception(PLAYER_SIGHT_POLICY, { state: () => { throw new Error('This canvas draws no scene.'); }, rules: () => undefined });
  return {
    sightSource: () => unlit,
    playersPerception: () => party,
    getTokenRenderer: () => null,
    getLightingController: () => null,
    getMeasureRenderer: () => null,
    getAnnotations: () => null,
    getViewportInstance: () => null,
    getCanvasElement: () => {
      throw new Error('This canvas is drawn nowhere.');
    },
    getCanvasAudience: () => ({ onChange: () => () => undefined, onSightChange: () => () => undefined }),
    addPlayerFrameLayer: () => ({ changed: () => undefined, remove: () => undefined }),
    getMapImage: () => null,
    getMapRect: () => null,
    getAppInstance: () => ({ renderer: null }),
    ...parts,
  };
}

/**
 * A canvas's token renderer that draws no sprite and holds no rules beyond `parts`: its map's collection names no
 * movement steps (no speeds, nothing counted per turn).
 */
export function fakeTokens(parts: Partial<MapTokens> = {}): MapTokens {
  return {
    getTokenSprites: () => ({}),
    collectionRules: () => ({ resources: () => [], conditions: () => [] }),
    tokenMovement: () => ({ rules: () => NO_MOVEMENT_RULES, speedOf: () => null, prepare: () => undefined }),
    dragRulerPath: () => null,
    setHeldPlayout: () => undefined,
    bumpToken: () => undefined,
    ...parts,
  };
}

/** What `fakeAtlasTab` hands out of a map view: its app and services, which look its map's rules up and roll no dice. */
export type FakeRulesView = Pick<MapView, 'app' | 'serviceManager'>;

/**
 * An Atlas map tab's canvas (`MapCanvas`) answering with Atlas's own rules: the players' sight, ambient light and
 * light reaches of the scene model, the players' frame of another perception (committed fog over it; on an unlit
 * scene none, and the perception with fog of `gmPerception` where none is given), token sprites where the tokens
 * stand, and what the players' frame shows of all of it through the players' perception (`PlayersPerception`), as
 * `PixiRendererOrchestrator` composes it; and the view's rules.
 */
export function fakeAtlasTab(options: FakeTabOptions): { readonly renderer: MapCanvas; readonly view: FakeRulesView } {
  const model = (): ReturnType<typeof gmModel>['model'] => gmModel(options.state(), options.source, options.bounds).model;
  const lighting: MapLighting = {
    renderer: {
      isEnabled: () => options.state().lighting.enabled,
      sightIsCurrent: () => options.drawn?.() ?? true,
      currentSight: () => model().sight,
      ambientLight: () => model().ambient,
      lightReaches: () => model().reaches,
    },
    sightAids: { rules: () => options.source.rules(), measurement: () => options.source.measurement() },
  };
  const sprites = (): Record<string, DrawnToken> => Object.fromEntries(Object.values(options.state().objects.tokens).map((token) => [token.id, { x: token.x, y: token.y, tokenSize: options.tokenSize ?? 70 }]));
  const playerFramePerception = (lit?: TokenPerception): TokenPerception | undefined => {
    const state = options.state();
    if (!state.lighting.enabled) return undefined;
    if (lit === undefined) return gmPerception(state, options.source, options.bounds);
    const fog = fogCoverage(state.objects.fog);
    return (id) => {
      const token = state.objects.tokens[id];
      return token === undefined || fog.covers(token) ? 'unseen' : lit(id);
    };
  };
  const tokens = fakeTokens({ getTokenSprites: sprites });
  const sight = canvasSightSource({ lighting: () => lighting, tokens: () => ({ playerFramePerception, getTokenSprites: sprites }) });
  const party = new PlayersPerception(PLAYER_SIGHT_POLICY, { state: () => options.state(), rules: () => options.source.rules() });
  const renderer = fakeCanvas({
    getLightingController: () => lighting,
    getTokenRenderer: () => tokens,
    getGridOptions: () => (options.grid?.() ?? null) as GridOptions | null,
    playerRollTokens: (mapPath, tokenIds) => party.shown(sight, mapPath, tokenIds),
    sightSource: () => sight,
    playersPerception: () => party,
  });
  const serviceManager: MapServices = {
    getAssetService: () => options.collections ?? null,
    getToolController: () => null,
    getEventBus: () => {
      throw new Error('This view has no event bus.');
    },
  };
  return { renderer, view: { app: (options.app ?? {}) as App, serviceManager } };
}

/** The companion's map layer source over a fake tab (`fakeAtlasTab`). */
export function fakeLayers(options: FakeTabOptions): MapLayerSource {
  const tab = fakeAtlasTab(options);
  return mapLayerSourceOf(tab.renderer, tab.view);
}
