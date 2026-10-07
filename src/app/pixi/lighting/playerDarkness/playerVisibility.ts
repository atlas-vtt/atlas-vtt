/**
 * What the GM's player window shows of a view's lit scene, for players who are not at it, and
 * nothing more: per token how the window perceives it, and the map cell by cell. Fails closed:
 * whatever Atlas cannot tell yet is `pending`, which means show players nothing. Never walls,
 * lights, polygons or sight: only what they decide.
 */
import type { Perception, PlayerVisibility } from '../../../../api/types/lighting';
import type { FogCoverage } from '../../../fog/fogCoverage';
import type { PlayerLighting } from '../playerLightingLayers';
import { loadedMapSize } from '../../../services/viewMapSize';
import type { ViewAtlasStore } from '../../../storeFactory';
import { MAX_DARKNESS_CELLS_PER_SIDE } from './darknessRaster';
import type { SightFrames } from './sightFrames';

/** The cells per side a caller may ask for, and what it gets when it asks for none (or for no number). */
export const CELLS_PER_SIDE = { min: 16, max: 1024, default: MAX_DARKNESS_CELLS_PER_SIDE } as const;

const UNLIT: PlayerVisibility = Object.freeze({ status: 'unlit', tokens: Object.freeze({}) });
const PENDING: PlayerVisibility = Object.freeze({ status: 'pending' });

/** What `visibilityOf` reads of a map view. */
export interface VisibilityView {
  readonly atlasStore: ViewAtlasStore;
  readonly renderer: {
    getBackgroundSprite(): { width: number; height: number; destroyed: boolean } | null;
    getPlayerLighting?(): PlayerLighting | null | undefined;
    /** The scene's committed fog as the window draws it; null while its geometry is invalid, undefined where the view has no fog. */
    getCommittedFog?(): FogCoverage | null | undefined;
  } | null;
}

export function cellsPerSide(asked: unknown): number {
  if (typeof asked !== 'number' || !Number.isFinite(asked)) return CELLS_PER_SIDE.default;
  return Math.min(CELLS_PER_SIDE.max, Math.max(CELLS_PER_SIDE.min, Math.round(asked)));
}

/** `{ status: 'pending' }`: what players get while Atlas cannot tell. */
export function pendingVisibility(): PlayerVisibility {
  return PENDING;
}

/**
 * The view's player visibility. Pending while the store holds no whole map (loading, a tab switch: a load clears the
 * scene's lighting before the next map's comes, so nothing about lighting can be told then), while the view cannot
 * tell for a lit scene, while sight is not the scene's, while the map has no size, while the explored memory shown
 * is still decoding, while it may hold less than its saved mask (an edit took area out), and while the scene's fog
 * cannot be drawn (the window then covers it whole). A token under committed fog is 'unseen', as the players' frame
 * hides it. Unlit where the view's lighting says it hides nothing, or where it cannot be read and the store's scene is
 * unlit: still fail closed for fog (`unlitVisibility`).
 */
export function visibilityOf(view: VisibilityView, frames: SightFrames, options: { maxCellsPerSide: number }): PlayerVisibility {
  const state = view.atlasStore.getState();
  if (!state.mapLoaded || state.isMapLoading) return PENDING;
  frames.followEdits(state.exploredEdits);
  const lighting = view.renderer?.getPlayerLighting?.();
  if (lighting === null || (lighting === undefined && !state.lighting.enabled)) return unlitVisibility(view, state);
  if (lighting === undefined) return PENDING;
  // Fog whose geometry is invalid covers the players' whole window.
  if (lighting.fog === null) return PENDING;
  const map = loadedMapSize(view);
  if (!(map.width > 0) || !(map.height > 0)) return PENDING;
  if (lighting.showsExplored && lighting.exploredSettling) {
    // The saved mask still holds what the window forgot: nothing decoded from it may stand in once the next one comes.
    frames.forgetExplored();
    return PENDING;
  }
  const { raster, exploredPending } = frames.raster(lighting, state.exploredMask, map, options.maxCellsPerSide);
  // A view whose sight is not the scene's is still asked: the raster after it then comes at once.
  if (!lighting.ready || exploredPending) return PENDING;
  // The players' frame hides every token under committed fog (#303), lit or not: so does this answer.
  const fog = lighting.fog;
  const tokens: Record<string, Perception> = {};
  for (const [id, token] of Object.entries(state.objects.tokens)) {
    tokens[id] = fog && fog.shape.length > 0 && fog.covers(token) ? 'unseen' : lighting.perception(id);
  }
  // A fresh buffer on every call: the raster is kept between calls, and no caller may change it for another.
  const shown = new Uint8Array(raster.dark.length);
  for (let i = 0; i < shown.length; i++) shown[i] = raster.dark[i] ? 0 : 1;
  return Object.freeze({
    status: 'ready',
    tokens: Object.freeze(tokens),
    darkness: Object.freeze({ cellSize: raster.cellSize, cols: raster.cols, rows: raster.rows, shown }),
    showsExplored: lighting.showsExplored,
  });
}

/**
 * An unlit scene: lighting hides nothing, but the players' frame still hides every token under committed fog (#303),
 * so those read 'unseen'. Pending while the fog cannot be drawn (the window covers the map whole) or the view cannot
 * read the fog a scene has.
 */
function unlitVisibility(view: VisibilityView, state: ReturnType<ViewAtlasStore['getState']>): PlayerVisibility {
  const operations = state.objects.fog;
  if (!operations || Object.keys(operations).length === 0) return UNLIT;
  const fog = view.renderer?.getCommittedFog?.();
  if (!fog) return PENDING;
  if (fog.shape.length === 0) return UNLIT;
  const tokens: Record<string, 'unseen'> = {};
  for (const [id, token] of Object.entries(state.objects.tokens)) if (fog.covers(token)) tokens[id] = 'unseen';
  return Object.freeze({ status: 'unlit', tokens: Object.freeze(tokens) });
}
