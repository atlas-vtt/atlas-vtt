import { cellNumberStyleOfGrid } from '../../../../src/app/grid/cellNumbering';
import { parseGridColor } from '../../../../src/app/grid/gridContrastColor';
import { heldForSight } from '../../../../src/app/lighting/sightOnDrop';
import type { CollectionLookup } from '../../../../src/app/gameSystems/mapRules';
import { tokenPerception } from '../../../../src/app/vision/tokenPerception';
import type { MapBounds } from '../../../../src/app/vision/visibility';
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
  readonly tokenSize?: number;
}

/**
 * An Atlas map tab's renderer and view as the companion's duck-typed readers find them (`view.serviceManager`, the
 * renderer's `lighting` controller and token renderer), answering with Atlas's own rules: the
 * players' sight, ambient light and light reaches of the scene model, the token perception with
 * committed fog of `gmPerception`, and token sprites where the tokens stand.
 */
export function fakeAtlasTab(options: FakeTabOptions): { readonly renderer: object; readonly view: object } {
  const model = (): ReturnType<typeof gmModel>['model'] => gmModel(options.state(), options.source, options.bounds).model;
  const view = {
    isEnabled: () => options.state().lighting.enabled,
    sightIsCurrent: () => true,
    currentSight: () => model().sight,
    ambientLight: () => model().ambient,
    lightReaches: () => model().reaches,
  };
  const controller = {
    renderer: view,
    playerSight: () => {
      const state = options.state();
      if (!state.lighting.enabled) return undefined;
      const built = model();
      return tokenPerception(built.sight, built.ambient, built.reaches, state.objects.tokens, { conditions: options.source.rules().conditions, held: heldForSight(state) });
    },
  };
  const tokenRenderer = {
    playerFramePerception: () => {
      const state = options.state();
      return state.lighting.enabled ? gmPerception(state, options.source, options.bounds) : undefined;
    },
    getTokenSprites: () => Object.fromEntries(Object.values(options.state().objects.tokens).map((token) => [token.id, { x: token.x, y: token.y, tokenSize: options.tokenSize ?? 70 }])),
  };
  const renderer = {
    lighting: controller,
    getTokenRenderer: () => tokenRenderer,
    getGridOptions: () => options.grid?.() ?? null,
  };
  const serviceManager = {
    getRendererService: () => ({ getRenderer: () => renderer }),
    getAssetService: () => options.collections ?? null,
  };
  return { renderer, view: { serviceManager } };
}

/** The companion's map layer source over a fake tab (`fakeAtlasTab`). */
export function fakeLayers(options: FakeTabOptions): MapLayerSource {
  const tab = fakeAtlasTab(options);
  return mapLayerSourceOf(tab.renderer, tab.view);
}
