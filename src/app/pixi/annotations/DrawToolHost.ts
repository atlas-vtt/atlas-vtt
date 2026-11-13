import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { TextMeasure } from '../../annotations/annotationBounds';
import { annotationIndex } from '../../annotations/annotationHit';
import { annotationList, annotationRoom } from '../../annotations/annotationList';
import { cleanFillsWritten } from '../../annotations/cleanFills';
import type { DrawLayer, DrawMode } from '../../annotations/annotationTypes';
import { drawCell, eraserRadius, stampSize } from '../../annotations/drawSizes';
import { snapDrawPoint, snapStampPoint } from '../../annotations/drawSnap';
import { sweepChange } from '../../annotations/eraseSweep';
import { liveDrawing, madeDrawing, madeStamp, type MadeShape } from '../../annotations/madeDrawing';
import type { UnderWay } from '../../annotations/underWay';
import type { MapRect } from '../../grid/cellNumbering';
import type { GridGeometry } from '../../grid/gridDistance';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { Point } from '../../types/visionTypes';
import { FogCursorPreview } from '../fog/FogCursorPreview';
import { CellsPainting } from './CellsPainting';
import type { ClickPlacingHost } from './ClickPlacing';
import type { DrawInputHost } from './DrawInput';
import type { GestureMode } from './drawGesture';
import { activeDrawMode } from './drawToolState';
import { LiveStroke } from './LiveStroke';

/**
 * What the GM is told of a limit: a level can hold no more `'drawings'` or `'texts'`, a drawing
 * can take no more `'cuts'` of the eraser, or a level was loaded with more drawings or texts than
 * are shown.
 */
export type FullOf = 'drawings' | 'texts' | 'cuts' | 'drawingsLeftOut' | 'textsLeftOut';

export interface DrawToolDeps {
  readonly viewport: Viewport;
  readonly store: StoreApi<ViewAtlasState>;
  /** The layer the drawing under way is shown in: the one a drawing like it will lie in. */
  layerOf(place: DrawLayer, hidden: boolean): Container;
  /** The measure the layer's texts are drawn by: the eraser reaches a text where it is drawn. */
  readonly measure: TextMeasure;
  /** Where the tool's own marks go, which only the GM's view of the canvas shows: the eraser's ring. */
  readonly chrome: Container;
  /** The grid points snap to; null without a grid or while its Snap is off. */
  snapGrid(): GridGeometry | null;
  /** The grid whose cells the Cells mode fills; null where the map has none, or it is switched off. */
  cellGrid(): GridGeometry | null;
  /** The map, at whose edge a filled cell ends; null without one. */
  mapRect(): MapRect | null;
  /** Whether the canvas shows the GM's view: the tool works there alone. */
  gmView(): boolean;
  /** Tells the GM that the level shown holds as many drawings or texts as it may, or that a drawing can take no further cut. */
  full(of: FullOf): void;
  /** Is told the drawing under way, for whoever shows it elsewhere. */
  readonly underWay: UnderWay;
}

const GESTURES: readonly DrawMode[] = ['pen', 'line', 'rectangle', 'ellipse', 'cells', 'eraser'];

/**
 * What the Draw tool's gestures do to the scene: the drawing under way is shown as it will stay
 * (`LiveStroke`), a finished one is written with the tool's choices (`madeDrawing`), and a press of
 * the Stamp mode places the tool's symbol (a text is typed on the map: `TextTyping`). What was
 * made is selected, so it can be pulled right at once; but not a pen's stroke, since the next
 * stroke often starts on the end of the last, where a handle would take the press. The
 * eraser cuts what its sweep passes (`sweepChange`), every step of it written at once and the
 * whole sweep one undo step; its ring follows the pointer. A drawing that can take no further cut
 * stays as it is, which the GM is told once a sweep. The Cells mode fills or clears the
 * cells its sweep passes (`CellsPainting`), written when the button comes up. A level that is full
 * takes nothing more, and says so.
 */
export class DrawToolHost {
  /** What `DrawInput` asks and tells. */
  readonly gestures: DrawInputHost;
  /** What `ClickPlacing` asks and tells. */
  readonly clicks: ClickPlacingHost;

  private readonly live = new LiveStroke();
  private readonly ring: FogCursorPreview;
  private readonly cells: CellsPainting;
  /** A drag of the Cells mode is under way: the sweep is its. */
  private painting = false;
  /** An eraser's sweep is under way: its undo step is open. */
  private sweeping = false;
  /** The sweep under way was already told that the level is full. */
  private toldFull = false;

  constructor(private readonly deps: DrawToolDeps) {
    this.ring = new FogCursorPreview(deps.viewport);
    deps.chrome.addChild(this.ring.getDisplayObject());
    this.cells = new CellsPainting({
      store: deps.store,
      layerOf: (place, hidden) => deps.layerOf(place, hidden),
      chrome: deps.chrome,
      grid: () => deps.cellGrid(),
      bounds: () => deps.mapRect(),
      zoom: () => this.zoom,
      full: () => deps.full('drawings'),
      underWay: deps.underWay,
    });
    this.gestures = {
      mode: () => this.gestureMode(),
      point: (world, free) => snapDrawPoint(deps.snapGrid(), world, free),
      started: (mode) => this.started(mode),
      changed: (shape) => this.changed(shape),
      swept: (path, alt) => this.swept(path, alt),
      finished: (made) => this.finished(made),
      cancelled: () => this.dropped(),
      hovered: (world) => this.hovered(world),
    };
    this.clicks = {
      ready: () => this.mode() === 'stamp',
      stamp: (world, free) => this.stamp(world, free),
    };
    this.toolChanged();
  }

  /** The tool, its mode or its size may be another, or the canvas shows another view: the eraser's ring shows by them. */
  toolChanged(): void {
    if (this.mode() !== 'eraser') {
      this.ring.hide();
      return;
    }
    const { drawTool, grid } = this.deps.store.getState();
    this.ring.setBrushRadius(eraserRadius(drawTool.size, drawCell(grid)));
    if (!this.ring.shown) this.ring.show(true);
  }

  destroy(): void {
    this.endSweep();
    this.live.destroy();
    this.cells.destroy();
    this.ring.destroy();
  }

  /** The mode the tool works in now; null while another tool is in hand, or the canvas shows the players' picture. */
  private mode(): DrawMode | null {
    return this.deps.gmView() ? activeDrawMode(this.deps.store.getState()) : null;
  }

  private gestureMode(): GestureMode | null {
    const mode = this.mode();
    if (mode === null || !GESTURES.includes(mode)) return null;
    // Without a grid that is shown there are no cells to fill.
    return mode === 'cells' && !this.cells.ready ? null : (mode as GestureMode);
  }

  private get zoom(): number {
    return Math.abs(this.deps.viewport.scale.x) || 1;
  }

  private started(mode: GestureMode): void {
    if (mode !== 'eraser') this.deps.underWay.begin();
    // The pen and the Cells mode work with nothing selected: what an earlier mode left selected is let go of.
    if (mode === 'pen' || mode === 'cells') this.deselect();
    if (mode === 'cells') {
      this.painting = true;
      this.cells.begin();
      return;
    }
    if (mode !== 'eraser' || this.sweeping) return;
    this.sweeping = true;
    this.toldFull = false;
    // One sweep cuts many drawings, a step at a time: all of it is one undo step.
    beginHistoryTransaction(this.deps.store);
  }

  private changed(shape: MadeShape): void {
    const { drawTool, grid } = this.deps.store.getState();
    const drawing = liveDrawing(shape, drawTool, drawCell(grid));
    if (drawing) {
      this.live.show(this.deps.layerOf(drawTool.layer, !drawTool.players), drawing, this.zoom);
      this.deps.underWay.show([drawing], shape.mode === 'pen');
    } else {
      this.live.clear();
      this.deps.underWay.drop();
    }
  }

  private swept(path: readonly Point[], alt: boolean): void {
    if (this.painting) {
      this.cells.sweep(path);
      return;
    }
    const state = this.deps.store.getState();
    const objects = levelObjects(state);
    const list = annotationList(objects);
    if (list.length === 0) return;
    const { drawTool } = state;
    const sweep = { points: path, radius: eraserRadius(drawTool.size, drawCell(state.grid)) };
    const change = sweepChange(annotationIndex(list, this.deps.measure), sweep, alt || drawTool.eraseWhole);
    if (!change) return;
    // A cut leaves more drawings than it takes: where the level cannot hold them, nothing is cut.
    if (change.added.length - change.removed.length > annotationRoom(objects).drawings) {
      this.tellFull('drawings');
      return;
    }
    // A drawing cut into as many points or holes as one may have stays as it is under this move.
    if (change.full) this.tellFull('cuts');
    if (change.removed.length > 0) {
      const ids = state.replaceDrawings(change.removed, change.added);
      cleanFillsWritten(change.added, ids, levelObjects(this.deps.store.getState()).drawings);
    }
    if (change.texts.length > 0) state.deleteAnnotations(change.texts);
  }

  /** Tells the GM what the sweep under way could not do, once for the sweep. */
  private tellFull(of: FullOf): void {
    if (!this.toldFull) this.deps.full(of);
    this.toldFull = true;
  }

  private finished(made: MadeShape | null): void {
    this.endSweep();
    if (this.painting) {
      // The cells tell of their drawing themselves.
      this.painting = false;
      this.cells.finish();
      this.live.clear();
      return;
    }
    let added = false;
    if (made) {
      const state = this.deps.store.getState();
      const drawing = madeDrawing(made, state.drawTool, drawCell(state.grid), this.zoom);
      if (drawing && this.hasRoom('drawings')) {
        const id = state.addDrawing(drawing);
        added = true;
        if (made.mode !== 'pen') this.select(id);
      }
    }
    // After the drawing is on the map: the stroke never blinks between the two.
    this.live.clear();
    if (added) this.deps.underWay.made();
    else this.deps.underWay.drop();
  }

  private dropped(): void {
    this.endSweep();
    this.painting = false;
    this.cells.drop();
    this.live.clear();
    this.deps.underWay.drop();
  }

  private hovered(world: Point): void {
    if (this.ring.shown) this.ring.updatePosition(world.x, world.y);
  }

  private stamp(world: Point, free: boolean): void {
    if (!this.hasRoom('drawings')) return;
    const state = this.deps.store.getState();
    const cell = drawCell(state.grid);
    const at = snapStampPoint(this.deps.snapGrid(), world, free, stampSize(state.drawTool.size, cell));
    this.select(state.addDrawing(madeStamp(at, state.drawTool, cell)));
  }

  /** What was just made is selected: it shows its handles until the next press elsewhere, and the bars show its style. */
  private select(id: string): void {
    this.deps.store.getState().setSelection([id]);
  }

  /** Takes the drawings and texts out of the selection. */
  private deselect(): void {
    const state = this.deps.store.getState();
    const { drawings, texts } = levelObjects(state);
    const others = state.selectedIds.filter((id) => !drawings[id] && !texts[id]);
    if (others.length !== state.selectedIds.length) state.setSelection(others);
  }

  /** Whether the level shown takes one more; tells the GM where it does not. */
  private hasRoom(of: 'drawings' | 'texts'): boolean {
    if (annotationRoom(levelObjects(this.deps.store.getState()))[of] > 0) return true;
    this.deps.full(of);
    return false;
  }

  private endSweep(): void {
    if (!this.sweeping) return;
    this.sweeping = false;
    endHistoryTransaction(this.deps.store);
  }
}
