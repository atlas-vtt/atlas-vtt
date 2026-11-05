import type { EventEmitter } from 'events';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { nearestHexCenter, type HexLayout, type Point } from '../grid/hexGeometry';
import { hexLayoutOfGrid } from '../grid/hexLinks';
import { squareCellCentre, squareGridOf } from '../grid/squareLattice';

/**
 * The note pin tool's preview under the pointer: a pin, or, while Shift is held,
 * the pin in the centre of the highlighted cell: the hex it would link on a hex
 * grid, the square it would sit in on a square grid.
 */
export class NotePinPreview {
  private active = false;
  private held = false;
  private shiftDown = false;
  private pointer: Point | null = null;
  private keyTarget: Document | null = null;

  constructor(
    private readonly eventBus: EventEmitter,
    private readonly store: StoreApi<ViewAtlasState>,
    private readonly icon: () => string,
  ) {}

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Shift') return;
    const down = e.type === 'keydown';
    if (down === this.shiftDown) return;
    this.shiftDown = down;
    this.update();
  };

  activate(): void {
    this.active = true;
    this.keyTarget = activeDocument;
    this.keyTarget.addEventListener('keydown', this.onKey);
    this.keyTarget.addEventListener('keyup', this.onKey);
    this.update();
  }

  deactivate(): void {
    this.active = false;
    this.keyTarget?.removeEventListener('keydown', this.onKey);
    this.keyTarget?.removeEventListener('keyup', this.onKey);
    this.keyTarget = null;
    this.shiftDown = false;
    this.pointer = null;
    this.eventBus.emit('pin-preview-hide');
    this.eventBus.emit('hex-link-preview-hide');
  }

  pointerMoved(point: Point, shiftKey: boolean): void {
    this.pointer = point;
    this.shiftDown = shiftKey;
    this.update();
  }

  /** The grid's hex layout when a Shift-click links a hex; null on other grids. */
  hexLayout(): HexLayout | null {
    return hexLayoutOfGrid(this.store.getState().grid);
  }

  /** Where a Shift-click puts the pin: the centre of the hex or square under `point`; null on a map without a grid. */
  cellCentre(point: Point): Point | null {
    const layout = this.hexLayout();
    if (layout) return nearestHexCenter(layout, point);
    const square = squareGridOf(this.store.getState().grid);
    return square ? squareCellCentre(square, point) : null;
  }

  /** Keeps the preview where it is while the note picker is open. */
  hold(): void {
    this.held = true;
  }

  /** Follows the pointer again once the note picker has closed. */
  release(): void {
    this.held = false;
    this.update();
  }

  /** Lights up the cell the pin goes to, with the pin in its centre, while its note picker is open. */
  showCell(center: Point): void {
    this.eventBus.emit('hex-link-preview', center);
    this.eventBus.emit('pin-preview-update', { ...center, icon: this.icon() });
  }

  private update(): void {
    if (!this.active || this.held) return;
    const centre = this.shiftDown && this.pointer ? this.cellCentre(this.pointer) : null;
    if (centre) {
      this.showCell(centre);
      return;
    }
    this.eventBus.emit('hex-link-preview-hide');
    if (this.pointer) {
      this.eventBus.emit('pin-preview-update', { ...this.pointer, icon: this.icon() });
    } else {
      this.eventBus.emit('pin-preview-show', { icon: this.icon() });
    }
  }
}
