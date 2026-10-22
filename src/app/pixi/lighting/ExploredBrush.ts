import type { EventEmitter } from 'events';
import type { Container, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ExploredBrushOptions, ExploredEdit } from '../../lighting/exploredEdits';
import { exploredMemoryEditable } from '../../lighting/sceneLightingOptions';
import type { ViewAtlasStore } from '../../storeFactory';
import { ShapeStroke } from '../../tools/shapeStroke';
import type { WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { ExploredOverlay } from './ExploredOverlay';
import { lightMarkerTheme } from './lightMarker';
import type { ExploredMemoryWatcher } from './sceneLightingView';

export interface ExploredBrushDeps {
  viewport: Viewport;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, ends a stroke that will get no release. */
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  /** Size of the map in world pixels, which the memory's texture covers. */
  bounds: () => MapBounds | null;
  /** Applies a finished stroke to the scene's memory, as one undo step (`SceneLightingView.editExplored`). */
  edit: (edit: ExploredEdit) => boolean;
  /** The tool entered or left the mode: whoever owns the layer's visibility shows or hides it. */
  onActiveChange: () => void;
  /** Tells the GM that undo (`undone`) or redo changed the memory while the canvas does not show it. */
  announce: (undone: boolean) => void;
}

/**
 * The lighting tool's explored-memory mode: a stroke with the brush, the lasso or the rectangle
 * marks an area as explored (Reveal) or takes its memory away (Forget). While the pointer is
 * down the stroke shows only on the GM's overlay; the release applies it to the memory as one
 * undo step, so a stroke that is cancelled (Escape, a lost pointer, the window losing focus,
 * another tool or mode, the players' view) leaves nothing. It changes what the scene remembers,
 * never what its tokens see now. It takes input only in its mode, on a lit scene that
 * remembers, and while its layer shows.
 */
export class ExploredBrush implements ExploredMemoryWatcher {
  private readonly overlay: ExploredOverlay;
  private readonly stroke = new ShapeStroke();
  private subMode: WallToolSubMode = 'draw';
  private pointer: Point | null = null;
  private wasActive = false;
  private readonly cleanups: Array<() => void> = [];
  private readonly redraw = (): void => this.draw();
  private readonly abort = (): void => this.stop();

  constructor(private readonly deps: ExploredBrushDeps) {
    const { viewport, store, eventBus } = deps;
    this.overlay = new ExploredOverlay(viewport);
    const onSubMode = (subMode: WallToolSubMode): void => {
      this.subMode = subMode;
      this.syncActive();
    };
    eventBus.on('wall-submode-changed', onSubMode);
    this.cleanups.push(() => eventBus.off('wall-submode-changed', onSubMode));
    viewport.on('zoomed', this.redraw);
    this.takeOptions(store.getState().exploredBrush);
    this.cleanups.push(() => viewport.off('zoomed', this.redraw), store.subscribe((state, previous) => {
      if (state.lighting !== previous.lighting) this.syncActive();
      if (state.exploredBrush !== previous.exploredBrush) {
        // The stroke under way was begun with other choices: it is dropped.
        this.stop();
        this.takeOptions(state.exploredBrush);
        this.draw();
      }
    }));
  }

  /** The layer with the memory's tint and the stroke under way. */
  get view(): Container {
    return this.overlay.view;
  }

  /** The lighting tool is in its explored-memory mode: its presses are no one else's. */
  get chosen(): boolean {
    return this.subMode === 'explored-memory';
  }

  /** In that mode on a scene whose memory can be edited. */
  get active(): boolean {
    return this.chosen && exploredMemoryEditable(this.deps.store.getState().lighting);
  }

  private get shown(): boolean {
    return this.active && this.view.visible;
  }

  /** The memory has a new texture, or none any more; the overlay lets go of the last before it is destroyed. */
  setTexture(texture: Texture | null): void {
    this.overlay.setTexture(texture, this.deps.bounds());
  }

  /** Undo or redo changed the memory: the overlay shows it, and without the overlay the GM is told. */
  memoryTravelled(undone: boolean): void {
    if (!this.shown) this.deps.announce(undone);
  }

  /** The layer was shown or hidden: a stroke goes on only where it is seen. */
  afterVisibilityChange(): void {
    if (this.view.visible) this.draw();
    else this.stop();
  }

  pointerDown(point: Point): boolean {
    if (!this.shown) return false;
    this.pointer = point;
    this.stroke.begin(point);
    this.watchPointer(true);
    this.draw();
    return true;
  }

  pointerMove(point: Point): void {
    if (!this.shown) return;
    this.pointer = point;
    this.stroke.extend(point);
    this.draw(false);
  }

  /** The pointer left the map: the brush's ring goes until it is back; a stroke under way goes on. */
  pointerLeft(): void {
    this.pointer = null;
    this.draw(false);
  }

  /** The release applies the stroke: one undo step, or none when it marked no area. */
  pointerUp(): void {
    if (!this.stroke.active) return;
    const area = this.stroke.finish();
    this.watchPointer(false);
    this.overlay.clearStroke();
    if (area) this.deps.edit({ mode: this.mode, area });
    this.draw();
  }

  /** Escape drops the stroke under way. */
  handleEscape(): boolean {
    if (!this.shown || !this.stroke.active) return false;
    this.stop();
    return true;
  }

  /** Drops the stroke under way: nothing of it reaches the memory. */
  stop(): void {
    if (this.stroke.active) this.watchPointer(false);
    this.stroke.cancel();
    this.overlay.clearStroke();
    this.draw();
  }

  /** What a stroke does: the tool's choices as the view's store holds them (`exploredBrush`), which the menu sets. */
  private get mode(): ExploredBrushOptions['mode'] {
    return this.deps.store.getState().exploredBrush.mode;
  }

  private takeOptions({ shape, brushSize }: ExploredBrushOptions): void {
    this.stroke.mode = shape;
    this.stroke.brushRadius = brushSize;
  }

  /** The mode began or ended, by the tool's menu or because the scene's memory can no longer be edited. */
  private syncActive(): void {
    if (this.active === this.wasActive) return;
    this.wasActive = this.active;
    if (!this.active) this.stop();
    this.deps.onActiveChange();
  }

  /** While a stroke is under way, a pointer that is lost drops it: no release would end it. */
  private watchPointer(on: boolean): void {
    const { canvas } = this.deps;
    const win = canvas.ownerDocument.defaultView;
    if (on) {
      canvas.addEventListener('pointercancel', this.abort);
      win?.addEventListener('blur', this.abort);
    } else {
      canvas.removeEventListener('pointercancel', this.abort);
      win?.removeEventListener('blur', this.abort);
    }
  }

  /** Draws the overlay; `retheme` false while it only follows the pointer, which never changes the theme. */
  private draw(retheme = true): void {
    if (!this.shown) {
      this.overlay.drawCursor(null, this.stroke, this.mode);
      return;
    }
    if (retheme) this.overlay.setTint(lightMarkerTheme().accent);
    this.overlay.drawCursor(this.pointer, this.stroke, this.mode);
    if (this.stroke.active) this.overlay.drawStroke(this.stroke, this.mode);
  }

  destroy(): void {
    this.stop();
    for (const cleanup of this.cleanups) cleanup();
    this.overlay.destroy();
  }
}
