/**
 * Token drag ruler: while a token is dragged, measures the path from where it
 * started to the cell it would land in and labels the distance at the path's middle.
 * Space adds a waypoint at the current landing cell; the distance adds up
 * across waypoints. The token still drops where the pointer is released.
 */

import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../grid/GridSystem';
import { pathLengthInCells } from '../../grid/gridDistance';
import type { Point } from '../../grid/hexGeometry';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import type { ViewAtlasState } from '../../storeFactory';
import type { LayerVisibility } from '../playerSafeFrame';
import type { DragRulerView } from './DragRulerView';

export class DragRuler {
  private tokenId: string | null = null;
  /** The snapped start followed by every waypoint. */
  private waypoints: Point[] = [];
  private landing: Point | null = null;
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
    this.waypoints = [this.snap(origin)];
    this.keyWindow = activeWindow;
    this.keyWindow.addEventListener('keydown', this.onKeyDown, true);
  }

  /** Moves the ruler's end to the cell a token at `position` would snap to. */
  update(position: Point): void {
    if (!this.tokenId) return;
    this.landing = this.snap(position);
    this.redraw();
  }

  end(): void {
    this.keyWindow?.removeEventListener('keydown', this.onKeyDown, true);
    this.keyWindow = null;
    this.tokenId = null;
    this.waypoints = [];
    this.landing = null;
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
    const landing = this.landing;
    if (!this.tokenId || !landing) return;
    const visible = this.tokenVisible(this.tokenId) && this.waypoints.some((point) => !samePoint(point, landing));
    for (const layer of this.view.layers) layer.visible = visible;
  }

  destroy(): void {
    this.end();
    this.view.destroy();
  }

  /** Captures Space before the map hotkeys, which would open the command palette mid-drag. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    const last = this.waypoints[this.waypoints.length - 1];
    if (event.repeat || !this.landing || (last && samePoint(last, this.landing))) return;
    this.waypoints.push(this.landing);
    this.redraw();
  };

  private redraw(): void {
    const landing = this.landing;
    if (!landing) return;
    const points = [...this.waypoints, landing];
    if (points.every(point => samePoint(point, landing))) {
      this.view.clear();
      return;
    }
    const grid = this.gridSystem.getOptions();
    const settings = this.settingsProvider();
    const distance = formatDistance(pathLengthInCells(grid, points, settings.diagonalRule), settings);
    this.view.draw(points, distance);
    this.refreshVisibility();
  }

  private snap(point: Point): Point {
    const snapToGrid = this.store.getState().grid?.snapToGrid ?? true;
    if (!snapToGrid) return { x: point.x, y: point.y };
    const size = this.tokenId ? this.store.getState().objects.tokens[this.tokenId]?.size : undefined;
    return this.gridSystem.snapTokenCenter(point.x, point.y, size || 1);
  }
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}
