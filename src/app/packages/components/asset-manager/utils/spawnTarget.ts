import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import { loadAtlasView } from '../../../../plugin/atlasLeaves';
import { FALLBACK_PITCH, cellPitch, formationGridFromOptions, type FormationGrid } from '../../../../encounters/encounterFormation';
import { showNotice } from '../../../../ui/notice';
import type { PlacementRequest } from '../../../../pixi/tokenPlacement/TokenPlacer';

// ─── Viewport helpers ───────────────────────────────────────────────

export interface ViewportLike {
  screenWidth: number;
  screenHeight: number;
  toWorld(point: { x: number; y: number }): { x: number; y: number };
  x?: number;
  y?: number;
  scale: { x: number };
  getVisibleBounds?(): { left: number; right: number; top: number; bottom: number };
  animate?(opts: { position: { x: number; y: number }; scale: number; time: number }): void;
}

export interface GridSystemLike {
  getOptions(): { type?: string; size: number; offsetX?: number; offsetY?: number; enabled?: boolean };
  snapTokenCenter(x: number, y: number, tokenSize: number): { x: number; y: number };
}

export interface SpawnContext {
  app: ObsidianApp;
  /** The view the asset manager belongs to; null for the global asset manager. */
  view: AtlasView | null;
  assetService: AssetService | null;
  /** The dice stream hit points joining a scene are rolled with: the local roller's (`diceRandom`). */
  random: () => number;
  /** Called once spawned tokens are in the GM's hand, waiting to be placed on the map: the asset manager closes then. */
  onPlacing?: () => void;
}

/** Lets the GM place tokens by hand on the target's map (`TokenPlacer`). */
export interface SpawnPlacer {
  place(request: PlacementRequest): Promise<string[]>;
}

export interface SpawnTarget {
  view: AtlasView;
  viewport: ViewportLike;
  gridSystem: GridSystemLike | null;
  /** Grid geometry for formation placement; null where tokens do not snap (`snapToGrid`) or the grid is unusable. */
  grid: FormationGrid | null;
  /** Spacing between spawned tokens. */
  pitch: number;
  /** Places the tokens by hand; null where the map cannot, and they are added where they were laid out. */
  placer: SpawnPlacer | null;
}

/**
 * The scene spawned tokens go to: the asset manager's own view or, for the global
 * asset manager, the open Atlas view, looked up now since the scene may have changed
 * since the manager opened. Null, after telling the user, while no scene is ready.
 */
export async function getSpawnTarget(ctx: SpawnContext): Promise<SpawnTarget | null> {
  const view = ctx.view ?? await loadAtlasView(ctx.app);
  if (!view) {
    showNotice('No scene is open. Open a scene to add tokens to it.');
    return null;
  }
  if (view !== ctx.view) void ctx.app.workspace.revealLeaf(view.leaf);
  return spawnTargetOf(view);
}

/** `view` as spawned tokens find it; null, after telling the user, while its scene is not ready. */
export function spawnTargetOf(view: AtlasView): SpawnTarget | null {
  const rendererService = view.serviceManager.getRendererService();
  const viewport = rendererService.getViewport() as ViewportLike | null;
  const { mapPath, isMapLoading, grid: gridState } = view.getStore().getState();
  if (!viewport || !mapPath || isMapLoading) {
    showNotice('The scene is still loading. Add the tokens once it is open.');
    return null;
  }
  const gridSystem = rendererService.getGridSystem() as GridSystemLike | null;
  const options = gridSystem?.getOptions();
  // Tokens snap to a hidden grid as to a shown one, as a dragged token does
  const grid = (gridState?.snapToGrid ?? true) && options ? formationGridFromOptions({ ...options, enabled: true }) : null;
  // A grid tokens do not snap to still sizes them, so it spaces them too
  const pitch = grid ? cellPitch(grid) : options && options.size > 0 ? options.size : FALLBACK_PITCH;
  return { view, viewport, gridSystem, grid, pitch, placer: rendererService.getRenderer()?.getTokenPlacer() ?? null };
}

export function getViewportCenter(viewport: ViewportLike): { x: number; y: number } {
  try {
    const centerScreen = { x: viewport.screenWidth / 2, y: viewport.screenHeight / 2 };
    return viewport.toWorld(centerScreen);
  } catch {
    return { x: viewport.x || 0, y: viewport.y || 0 };
  }
}

/** Where a token of `tokenSize` cells is put down in the middle of what the GM sees, on the grid where it snaps. */
export function viewCentrePlace(target: SpawnTarget, tokenSize: number): { x: number; y: number } {
  const centre = getViewportCenter(target.viewport);
  return target.grid && target.gridSystem ? target.gridSystem.snapTokenCenter(centre.x, centre.y, tokenSize) : centre;
}

// ─── Grid layout helper ─────────────────────────────────────────────

export function gridPosition(
  index: number,
  total: number,
  centerX: number,
  centerY: number,
  cellSize: number,
  gridSystem: GridSystemLike | null,
  tokenSize: number
): { x: number; y: number } {
  const tokensPerRow = Math.ceil(Math.sqrt(total));
  const totalRows = Math.ceil(total / tokensPerRow);
  const row = Math.floor(index / tokensPerRow);
  const col = index % tokensPerRow;

  let x = centerX + (col - (tokensPerRow - 1) / 2) * cellSize;
  let y = centerY + (row - (totalRows - 1) / 2) * cellSize;

  if (gridSystem) {
    const snapped = gridSystem.snapTokenCenter(x, y, tokenSize);
    x = snapped.x;
    y = snapped.y;
  }

  return { x, y };
}
