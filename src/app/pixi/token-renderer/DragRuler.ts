/**
 * Token drag ruler: while a token is dragged, measures the path from where it
 * started to the cell it would land in and labels the distance at the path's middle.
 * Space adds a waypoint at the current landing cell; the distance adds up
 * across waypoints. The token still drops where the pointer is released.
 */

import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../grid/GridSystem';
import { type GridGeometry } from '../../grid/gridDistance';
import { tokenCenterShift } from '../../grid/gridPlacement';
import type { Point } from '../../grid/hexGeometry';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { ViewAtlasState } from '../../storeFactory';
import type { LayerVisibility } from '../playerSafeFrame';
import { DragRulerPath, dragRulerLabel, WAYPOINT_KEY } from './dragRulerPath';
import type { DragRulerView } from './DragRulerView';

export class DragRuler {
  private tokenId: string | null = null;
  private readonly path = new DragRulerPath((point) => this.snap(point));
  private keyWindow: Window | null = null;

  constructor(
    private readonly view: DragRulerView,
    private readonly gridSystem: GridSystem,
    private readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
    private readonly settingsProvider: () => MeasurementSettings,
    private readonly tokenVisible: (tokenId: string) => boolean = () => true,
  ) {}

  /** Starts measuring a drag of `tokenId`, which started at `origin`. */
  begin(tokenId: string, origin: Point): void {
    this.end();
    this.tokenId = tokenId;
    this.path.begin(origin);
    this.keyWindow = activeWindow;
    this.keyWindow.addEventListener('keydown', this.onKeyDown, true);
  }

  /** Moves the ruler's end to the cell a token at `position` would snap to. */
  update(position: Point): void {
    if (!this.tokenId) return;
    this.path.update(position);
    this.redraw();
  }

  end(): void {
    this.keyWindow?.removeEventListener('keydown', this.onKeyDown, true);
    this.keyWindow = null;
    this.tokenId = null;
    this.path.end();
    this.view.clear();
  }

  /** Players never see the ruler of a token hidden from them, or of one they do not see (`isSeen`, with dynamic lighting). */
  getPlayerViewLayers(isSeen: (tokenId: string) => boolean = () => true): LayerVisibility[] {
    const token = this.tokenId ? this.store.getState().objects.tokens[this.tokenId] : undefined;
    const shown = !token || (!token.isHidden && isSeen(token.id));
    return shown ? [] : this.view.layers.map(layer => ({ layer, visible: false }));
  }

  /** A held token can enter fog without ending its measured drag. */
  refreshVisibility(): void {
    if (!this.tokenId) return;
    // Nothing to show while the path has no length (`DragRulerPath.points`).
    const visible = this.path.points() !== null && this.tokenVisible(this.tokenId);
    for (const layer of this.view.layers) layer.visible = visible;
  }

  destroy(): void {
    this.end();
    this.view.destroy();
  }

  /** Captures Space before the map hotkeys, which would open the command palette mid-drag. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== WAYPOINT_KEY) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat && this.path.addWaypoint()) this.redraw();
  };

  private redraw(): void {
    const points = this.path.points();
    if (!points) {
      this.view.clear();
      return;
    }
    const grid = this.gridSystem.getOptions();
    const settings = this.settingsProvider();
    this.view.draw(points, dragRulerLabel(grid, this.cellPath(points, grid), settings));
    this.refreshVisibility();
  }

  private snap(point: Point): Point {
    if (!this.snapsToGrid()) return { x: point.x, y: point.y };
    return this.gridSystem.snapTokenCenter(point.x, point.y, this.tokenSize());
  }

  /**
   * The snapped path as the cells the token's footprint starts from. An even footprint snaps to where
   * cells meet, and on a hex grid that point lies in none of the three hexes around it: which one the
   * rounding picks differs from place to place, so the same drag measured a hex more or less.
   */
  private cellPath(points: readonly Point[], grid: GridGeometry): readonly Point[] {
    if (!this.snapsToGrid()) return points;
    const shift = tokenCenterShift(grid.type, grid.size, this.tokenSize());
    return points.map(point => ({ x: point.x - shift.x, y: point.y - shift.y }));
  }

  private snapsToGrid(): boolean {
    return this.store.getState().grid?.snapToGrid ?? true;
  }

  private tokenSize(): number {
    const size = this.tokenId ? this.store.getState().objects.tokens[this.tokenId]?.size : undefined;
    return size || 1;
  }
}
