import type { EventEmitter } from 'events';
import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { chosenLightPreset, emissionOf } from '../../lighting/lightPresetChoice';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { ViewAtlasStore } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import { WallTool, type WallToolMode, type WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import type { WallType } from '../../types/wallTypes';
import { DoorPlacement } from '../vision/DoorPlacement';
import { WallInteraction } from '../vision/WallInteraction';
import { WallRenderer } from '../vision/WallRenderer';
import { WallDrawingSession } from './WallDrawingSession';
import { splitWall } from './wallEdits';
import { chainEndingAt, wallEndNear } from './wallEnds';
import { levelObjects } from '../../levels/levelObjects';

interface SegmentEvent { p1: Point; p2: Point; type: WallType; chainId: string }

/**
 * The lighting tool's editor: wall lines and their handles, and the tool's input to them. Lights
 * have their own markers, which take the pointer before the editor does (`LightInteraction`);
 * the editor only keeps which of them are selected. It takes input only while its layer shows
 * (`shown`); whoever owns the layer's visibility calls `afterVisibilityChange`, which ends
 * whatever was under way once it is hidden, so nothing is drawn or dragged where no one sees it.
 */
export class WallEditor {
  readonly renderer: WallRenderer;
  readonly walls: WallInteraction;
  readonly doors: DoorPlacement;
  private readonly tool: WallTool;
  private readonly drawing: WallDrawingSession;
  private readonly cleanups: Array<() => void> = [];
  /** Alt was held at the last pointer move: what is drawn lands where the pointer is, not on a wall end close by. */
  private free = false;

  /** `onLightSelection` shows the selected lights on their markers; `lightPresets` are the lights of the map's collection. */
  constructor(
    viewport: Viewport,
    private readonly store: ViewAtlasStore,
    eventBus: EventEmitter,
    onLightSelection: (lightIds: string[]) => void,
    private readonly lightPresets: () => readonly LightPresetDefinition[],
  ) {
    this.renderer = new WallRenderer(viewport, store);
    this.walls = new WallInteraction(store, this.renderer, onLightSelection);
    this.doors = new DoorPlacement(store, this.renderer, this.walls);
    this.tool = new WallTool(eventBus);
    this.drawing = new WallDrawingSession(store);
    this.listen(eventBus);
  }

  /** The layer with the editor's lines and handles. */
  get layer(): Container {
    return this.renderer.getContainer();
  }

  get shown(): boolean {
    return this.layer.visible;
  }

  /** The layer was shown or hidden: it draws only while shown, and edits nothing while hidden. */
  afterVisibilityChange(): void {
    if (this.shown) this.renderer.forceRedraw();
    else this.stop();
  }

  /** Alt places a wall's corner freely, where it would otherwise land on a wall's end close by. */
  pointerDown(point: Point, shift: boolean, ctrl: boolean, alt: boolean = false): boolean {
    if (!this.shown) return false;
    if (this.doors.active) {
      this.doors.confirm();
      return true;
    }
    const settings = this.tool.getSettings();
    // A chain under way takes every press, also on a wall or its end: that is where it joins them.
    if (this.drawingChain && !ctrl) {
      this.placeCorner(point, shift, alt);
      return true;
    }
    if (shift && !ctrl && this.drawsChains) {
      // Shift on a vertex continues from it; Shift on a wall line splits the wall there
      const endpoint = this.vertexAt(point);
      if (endpoint) {
        this.startChainAt(endpoint);
        return true;
      }
      const wallId = this.renderer.hitTestWalls(point.x, point.y);
      if (wallId) {
        this.split(wallId, point);
        return true;
      }
    }
    // Without Shift (or with Ctrl to multi-select), existing walls take the click
    if ((!shift || ctrl) && this.walls.handlePointerDown(point.x, point.y, ctrl)) {
      this.renderer.preview.clear();
      return true;
    }
    if (settings.subMode === 'place-light') {
      const emission = emissionOf(chosenLightPreset(this.lightPresets(), settings.lightPreset));
      this.store.getState().addLight({ x: point.x, y: point.y, emission });
      return true;
    }
    if (settings.mode === 'point-to-point') {
      this.tool.addVertex(point.x, point.y, shift);
      return true;
    }
    const start = this.vertexAt(point) ?? point;
    this.tool.startFreeform(start.x, start.y);
    this.renderer.preview.startStroke(start.x, start.y);
    return true;
  }

  pointerMove(point: Point, alt: boolean = false): void {
    if (!this.shown) return;
    this.free = alt;
    if (this.doors.active) {
      this.doors.move(point);
      return;
    }
    if (this.walls.isDragging()) {
      this.walls.handlePointerMove(point.x, point.y, alt);
      return;
    }
    if (!this.tool.isCurrentlyDrawing()) return;
    if (this.tool.getSettings().mode === 'point-to-point') {
      const end = alt ? null : this.wallEndNear(point);
      this.renderer.preview.moveCursor((end ?? point).x, (end ?? point).y, end !== null);
    } else {
      this.tool.addFreeformPoint(point.x, point.y);
      this.renderer.preview.addStrokePoint(point.x, point.y);
    }
  }

  /** A wall end clicked in place starts a chain there, joined to it; pressed and dragged, it moved. */
  pointerUp(): void {
    const clicked = this.walls.handlePointerUp();
    if (clicked && this.drawsChains && !this.tool.isCurrentlyDrawing()) {
      this.walls.clearSelection();
      this.startChainAt(clicked);
    }
    this.finishStroke();
  }

  /** A double click ends the chain being drawn. */
  doubleClick(): void {
    if (this.shown) this.tool.finishChain();
  }

  cursorAt(point: Point): string {
    if (!this.shown) return 'default';
    if (this.doors.active || this.drawingChain) return 'crosshair';
    if (this.renderer.hitTestVertices(point.x, point.y)) return 'grab';
    return this.renderer.hitTestWalls(point.x, point.y) ? 'pointer' : 'crosshair';
  }

  /** The editor takes a press at the point before a light's marker beneath it: on a wall's handle, and anywhere while a chain is drawn or a door placed. */
  handleAt(point: Point): boolean {
    return this.shown && (this.doors.active || this.drawingChain || this.renderer.hitTestVertices(point.x, point.y) !== null);
  }

  /** Escape: stop placing a door, drop the chain being drawn, or clear the wall selection. */
  handleEscape(): boolean {
    if (!this.shown) return false;
    if (this.doors.active) this.doors.cancel();
    else if (this.tool.isCurrentlyDrawing()) this.tool.cancelDrawing();
    else if (this.walls.hasSelection()) this.walls.clearSelection();
    else return false;
    return true;
  }

  handleDelete(): boolean {
    if (!this.shown) return false;
    this.walls.deleteSelected();
    return true;
  }

  /** A chain half drawn on a scene must not follow the map switch. */
  cancelDrawing(): void {
    this.tool.cancelDrawing();
  }

  /** The tool draws walls corner by corner. */
  private get drawsChains(): boolean {
    const { mode, subMode } = this.tool.getSettings();
    return mode === 'point-to-point' && subMode === 'draw';
  }

  private get drawingChain(): boolean {
    return this.drawsChains && this.tool.isCurrentlyDrawing();
  }

  /** The chain's next corner, on the wall end close by unless `free`. A click on its last corner adds nothing, and one that closes the chain on its first ends it. */
  private placeCorner(point: Point, shift: boolean, free: boolean): void {
    const at = free ? point : this.wallEndNear(point) ?? point;
    const chain = this.tool.getCurrentChain();
    const same = (other: Point | undefined): boolean => !!other && other.x === at.x && other.y === at.y;
    if (same(chain[chain.length - 1])) return;
    this.tool.addVertex(at.x, at.y, shift && !same(chain[0]));
  }

  /** Starts a chain at a wall end; it continues the chain of the one wall ending there. */
  private startChainAt(point: Point): void {
    this.tool.continueFromEndpoint(point.x, point.y, chainEndingAt(point, levelObjects(this.store.getState()).walls));
  }

  /** Ends the stroke being drawn, on a wall end close to where it stopped (or its own start) unless Alt was held. */
  private finishStroke(): void {
    if (!this.tool.isCurrentlyDrawing() || this.tool.getSettings().mode !== 'freeform') return;
    const stroke = this.tool.getCurrentChain();
    const last = stroke[stroke.length - 1];
    const end = last && !this.free ? this.wallEndNear(last, stroke.slice(0, 1)) : null;
    if (end) this.tool.addFreeformPoint(end.x, end.y);
    // A stroke's segments arrive together; one session makes them one undo step
    this.drawing.start();
    this.tool.finishFreeform();
    this.drawing.finish();
    this.renderer.preview.clearStroke();
  }

  /** Ends a drag, a door placement and the chain or stroke being drawn. */
  private stop(): void {
    this.walls.handlePointerUp();
    this.doors.cancel();
    if (this.store.getState().activeTool === 'wall') {
      // Only hidden (session view, the peek key): what was drawn so far is kept, as its one undo step.
      this.finishStroke();
      this.tool.finishChain();
    } else {
      this.tool.cancelDrawing();
    }
    this.renderer.preview.clear();
    this.renderer.preview.clearStroke();
  }

  private wallEndNear(point: Point, also: readonly Point[] = []): Point | null {
    return wallEndNear(point, levelObjects(this.store.getState()).walls, this.renderer.zoom, { also });
  }

  private vertexAt(point: Point): Point | null {
    const hit = this.renderer.hitTestVertices(point.x, point.y);
    return hit ? levelObjects(this.store.getState()).walls[hit.wallId]?.[hit.vertex] ?? null : null;
  }

  private split(wallId: string, at: Point): void {
    const state = this.store.getState();
    const wall = levelObjects(state).walls[wallId];
    const halves = wall ? splitWall(wall, at) : null;
    if (!halves) return;
    runHistoryTransaction(this.store, () => {
      state.deleteWall(wallId);
      for (const half of halves) state.addWall(half);
    });
  }

  private listen(eventBus: EventEmitter): void {
    const on = <Args extends unknown[]>(event: string, handler: (...args: Args) => void): void => {
      eventBus.on(event, handler);
      this.cleanups.push(() => eventBus.off(event, handler));
    };
    on('wall-submode-changed', (subMode: WallToolSubMode) => this.tool.setSubMode(subMode));
    on('wall-type-changed', (type: WallType) => this.tool.setWallType(type));
    on('wall-mode-changed', (mode: WallToolMode) => this.tool.setMode(mode));
    on('lighting-preset-changed', (preset: string) => this.tool.setLightPreset(preset));
    on('wall-chain-start', (point: Point) => {
      this.drawing.start();
      this.renderer.preview.setAnchor(point);
    });
    on('wall-segment-created', ({ p1, p2, type, chainId }: SegmentEvent) => {
      this.drawing.add({ type, p1, p2, chainId, closed: true });
      if (this.tool.isCurrentlyDrawing()) this.renderer.preview.setAnchor(p2);
    });
    on('wall-chain-finish', () => {
      this.drawing.finish();
      this.renderer.preview.clear();
    });
    on('wall-drawing-cancelled', () => {
      this.drawing.cancel();
      this.renderer.preview.clear();
      this.renderer.preview.clearStroke();
    });
  }

  destroy(): void {
    this.drawing.finish();
    for (const cleanup of this.cleanups) cleanup();
    this.renderer.destroy();
    this.walls.destroy();
  }
}
