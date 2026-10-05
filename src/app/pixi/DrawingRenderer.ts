import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../stores/history';
import type { DrawingStroke } from '../types';
import { MAP_ICON_SVG, MAP_ICON_SIZE } from './mapIcons';
import { createLucideIconTexture } from './utils/lucideIconTexture';
import { splitStrokeByBrush } from './drawingEraseUtils';
import { FogCursorPreview } from './fog/FogCursorPreview';
import { destroyTree } from './utils/destroyTree';
import { isHandled } from './utils/handledEvents';

export interface DrawingSettings {
  color: string;
  width: number;
  /** Icon placed by the `draw-icon` tool */
  icon: string;
  /** Diameter of the eraser brush, in world units */
  eraserWidth: number;
}

const DEFAULT_SETTINGS: DrawingSettings = {
  color: '#ffffff',
  width: 4,
  icon: 'door-open',
  eraserWidth: 40,
};

/** Extra world-space slack when testing whether the eraser covers an icon. */
const ERASER_SLACK = 6;

/**
 * Renders freehand ink strokes and icon stamps stored in
 * `state.objects.drawings`, and handles the pen / icon / eraser tools.
 * Everything lives in world space, so annotations pan and zoom with the map
 * and persist through the normal `objects` persistence path.
 */
export class DrawingRenderer {
  private container: PIXI.Container;
  private preview: PIXI.Graphics;
  private nodes = new Map<string, PIXI.Container>();
  /** Stroke each node was last drawn from; a new reference means it moved or was restored by undo. */
  private rendered = new Map<string, DrawingStroke>();
  private cursorPreview: FogCursorPreview;
  private iconTextures = new Map<string, PIXI.Texture>();

  private settings: DrawingSettings = { ...DEFAULT_SETTINGS };
  /** A pen stroke is in progress — committed rendering is deferred until it ends. */
  private isDrawing = false;
  /** An eraser drag is in progress — the layer must keep re-rendering live. */
  private isErasing = false;
  private currentPoints: Array<{ x: number; y: number }> = [];

  private unsubscribe: (() => void) | null = null;
  private readonly pointerDownHandler: (e: PIXI.FederatedPointerEvent) => void;
  private readonly pointerMoveHandler: (e: PIXI.FederatedPointerEvent) => void;
  private readonly pointerUpHandler: () => void;
  private readonly settingsHandler: (settings: Partial<DrawingSettings>) => void;
  private readonly clearAllHandler: () => void;

  constructor(
    private viewport: Viewport,
    private eventBus: EventEmitter,
    private store: StoreApi<ViewAtlasState>
  ) {
    this.container = new PIXI.Container();
    this.container.label = 'drawingLayer';
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.container.sortableChildren = true;

    this.preview = new PIXI.Graphics();
    this.preview.eventMode = 'none';
    this.preview.zIndex = 1; // above committed strokes, below the brush cursor
    this.container.addChild(this.preview);

    // Reuses the fog brush cursor — a plain world-space circle at the pointer.
    this.cursorPreview = new FogCursorPreview(this.viewport);
    this.cursorPreview.setBrushRadius(DEFAULT_SETTINGS.eraserWidth / 2);
    this.container.addChild(this.cursorPreview.getDisplayObject());

    this.pointerDownHandler = (e) => this.onPointerDown(e);
    this.pointerMoveHandler = (e) => this.onPointerMove(e);
    this.pointerUpHandler = () => this.onPointerUp();
    this.settingsHandler = (settings) => {
      this.settings = { ...this.settings, ...settings };
      this.cursorPreview.setBrushRadius(this.settings.eraserWidth / 2);
    };
    this.clearAllHandler = () => this.store.getState().clearDrawings();

    this.viewport.on('pointerdown', this.pointerDownHandler);
    this.viewport.on('pointermove', this.pointerMoveHandler);
    this.viewport.on('pointerup', this.pointerUpHandler);
    this.viewport.on('pointerupoutside', this.pointerUpHandler);
    this.eventBus.on('drawing-settings-changed', this.settingsHandler);
    this.eventBus.on('drawing-clear-all', this.clearAllHandler);

    this.subscribeToStore();
    this.rebuild();
  }

  public getContainer(): PIXI.Container {
    return this.container;
  }

  // ── Store wiring ────────────────────────────────────────────────────

  private subscribeToStore(): void {
    let prevDrawings = this.store.getState().objects?.drawings;
    let prevTool = this.store.getState().activeTool;

    this.unsubscribe = this.store.subscribe((state) => {
      if (state.objects?.drawings !== prevDrawings) {
        prevDrawings = state.objects?.drawings;
        if (!this.isDrawing) this.rebuild();
      }

      if (state.activeTool !== prevTool) {
        prevTool = state.activeTool;
        // Viewport is never paused: right-drag pan and wheel zoom stay live
        // while drawing, since pan is bound to the right mouse button.
        if (!this.isToolActive()) this.resetStroke();
        if (state.activeTool === 'draw-eraser') {
          this.cursorPreview.show(true);
        } else {
          this.cursorPreview.hide();
        }
      }
    });
  }

  private isToolActive(): boolean {
    const tool = this.store.getState().activeTool;
    return tool === 'draw-pen' || tool === 'draw-eraser' || tool === 'draw-icon';
  }

  // ── Rendering ───────────────────────────────────────────────────────

  /** Sync one display object per stored annotation, reusing existing ones. */
  private rebuild(): void {
    const drawings = this.store.getState().objects?.drawings ?? {};

    for (const [id, node] of this.nodes) {
      if (!drawings[id]) {
        node.destroy();
        this.nodes.delete(id);
        this.rendered.delete(id);
      }
    }

    for (const stroke of Object.values(drawings)) {
      const previous = this.rendered.get(stroke.id);
      if (previous === stroke) continue;
      this.rendered.set(stroke.id, stroke);

      let existing = this.nodes.get(stroke.id);
      if (stroke.type === 'icon') {
        // A restyled stamp needs a new texture; a moved one only a new position
        if (existing && (previous?.icon !== stroke.icon || previous?.color !== stroke.color)) {
          existing.destroy();
          this.nodes.delete(stroke.id);
          existing = undefined;
        }
        const center = stroke.points[0];
        if (existing && center) existing.position.set(center.x, center.y);
        else if (!existing) this.addIconNode(stroke);
        continue;
      }

      let graphics = existing as PIXI.Graphics | undefined;
      if (!graphics) {
        graphics = new PIXI.Graphics();
        graphics.eventMode = 'none';
        this.container.addChild(graphics);
        this.nodes.set(stroke.id, graphics);
      }
      this.drawStroke(graphics, stroke.points, stroke.color, stroke.width, stroke.opacity);
    }
  }

  /** Place an icon stamp; its texture is rasterised (and cached) on demand. */
  private addIconNode(stroke: DrawingStroke): void {
    const center = stroke.points[0];
    const markup = stroke.icon ? MAP_ICON_SVG[stroke.icon] : undefined;
    if (!center || !markup) return;

    const sprite = new PIXI.Sprite();
    sprite.eventMode = 'none';
    sprite.anchor.set(0.5);
    sprite.position.set(center.x, center.y);
    sprite.width = stroke.width;
    sprite.height = stroke.width;
    sprite.alpha = stroke.opacity;
    this.container.addChild(sprite);
    this.nodes.set(stroke.id, sprite);

    const cacheKey = `${stroke.icon}-${stroke.color}`;
    const cached = this.iconTextures.get(cacheKey);
    if (cached) {
      sprite.texture = cached;
      return;
    }

    createLucideIconTexture(markup, stroke.color, 96)
      .then((texture) => {
        this.iconTextures.set(cacheKey, texture);
        if (sprite.destroyed) return;
        sprite.texture = texture;
        sprite.width = stroke.width;
        sprite.height = stroke.width;
      })
      .catch((err) => console.error('[DrawingRenderer] Failed to rasterise icon:', err));
  }

  private drawStroke(
    graphics: PIXI.Graphics,
    points: Array<{ x: number; y: number }>,
    color: string,
    width: number,
    opacity: number
  ): void {
    graphics.clear();
    const first = points[0];
    if (!first) return;

    if (points.length === 1) {
      graphics.circle(first.x, first.y, width / 2).fill({ color, alpha: opacity });
      return;
    }

    graphics.moveTo(first.x, first.y);
    for (const point of points.slice(1)) {
      graphics.lineTo(point.x, point.y);
    }
    graphics.stroke({ color, width, alpha: opacity, cap: 'round', join: 'round' });
  }

  // ── Input ───────────────────────────────────────────────────────────

  private onPointerDown(e: PIXI.FederatedPointerEvent): void {
    // A press a pin, door badge or light marker took is not a stroke.
    if (!this.isToolActive() || e.button !== 0 || isHandled(e)) return;

    const world = this.viewport.toWorld(e.global);
    const tool = this.store.getState().activeTool;

    if (tool === 'draw-eraser') {
      this.isErasing = true;
      // One eraser sweep touches many strokes; record it as a single undo step
      beginHistoryTransaction(this.store);
      this.eraseAt(world);
      return;
    }

    if (tool === 'draw-icon') {
      this.store.getState().addDrawing({
        type: 'icon',
        icon: this.settings.icon,
        points: [{ x: world.x, y: world.y }],
        color: this.settings.color,
        width: MAP_ICON_SIZE,
        opacity: 1,
      });
      return;
    }

    this.isDrawing = true;
    this.currentPoints = [{ x: world.x, y: world.y }];
    this.renderPreview();
  }

  private onPointerMove(e: PIXI.FederatedPointerEvent): void {
    const pointer = this.viewport.toWorld(e.global);
    if (this.store.getState().activeTool === 'draw-eraser') {
      this.cursorPreview.updatePosition(pointer.x, pointer.y);
    }

    if (this.isErasing) {
      this.eraseAt(pointer);
      return;
    }

    if (!this.isDrawing) return;

    const world = pointer;
    const last = this.currentPoints[this.currentPoints.length - 1];
    // ponytail: fixed 2px world-space threshold, good enough at normal zoom levels
    if (last && (world.x - last.x) ** 2 + (world.y - last.y) ** 2 < 4) return;

    this.currentPoints.push({ x: world.x, y: world.y });
    this.renderPreview();
  }

  private onPointerUp(): void {
    if (this.isErasing) {
      this.finishErase();
      return;
    }
    if (!this.isDrawing) return;

    const points = this.currentPoints;
    this.resetStroke();

    if (points.length > 0 && this.store.getState().activeTool === 'draw-pen') {
      this.store.getState().addDrawing({
        type: 'pen',
        points,
        color: this.settings.color,
        width: this.settings.width,
        opacity: 1,
      });
    }
    this.rebuild();
  }

  private renderPreview(): void {
    this.drawStroke(
      this.preview,
      this.currentPoints,
      this.settings.color,
      this.settings.width,
      1
    );
  }

  private resetStroke(): void {
    this.finishErase();
    this.isDrawing = false;
    this.currentPoints = [];
    this.preview.clear();
  }

  private finishErase(): void {
    if (!this.isErasing) return;
    this.isErasing = false;
    endHistoryTransaction(this.store);
  }

  /**
   * Rub out only the ink inside the eraser brush.
   *
   * A partially erased stroke is replaced by the fragments that survive, so a
   * swipe through the middle of a line leaves the two ends behind. Icons can't
   * be partially erased — they go when the brush covers their centre.
   */
  private eraseAt(world: { x: number; y: number }): void {
    const state = this.store.getState();
    const drawings = state.objects?.drawings ?? {};
    const radius = this.settings.eraserWidth / 2;

    for (const stroke of Object.values(drawings)) {
      if (stroke.type === 'icon') {
        const center = stroke.points[0];
        const reach = radius + stroke.width / 2 + ERASER_SLACK;
        if (center && (world.x - center.x) ** 2 + (world.y - center.y) ** 2 <= reach * reach) {
          state.deleteDrawing(stroke.id);
        }
        continue;
      }

      // Widen the brush by the stroke's own thickness so fat lines erase fully.
      const fragments = splitStrokeByBrush(stroke.points, world, radius + stroke.width / 2);
      if (!fragments) continue;

      state.deleteDrawing(stroke.id);
      const { id, kind, timestamp, points: originalPoints, ...properties } = stroke;
      for (const points of fragments) {
        state.addDrawing({
          ...properties,
          points,
        });
      }
    }
  }

  // ── Teardown ────────────────────────────────────────────────────────

  public destroy(): void {
    this.viewport.off('pointerdown', this.pointerDownHandler);
    this.viewport.off('pointermove', this.pointerMoveHandler);
    this.viewport.off('pointerup', this.pointerUpHandler);
    this.viewport.off('pointerupoutside', this.pointerUpHandler);
    this.eventBus.off('drawing-settings-changed', this.settingsHandler);
    this.eventBus.off('drawing-clear-all', this.clearAllHandler);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cursorPreview.destroy();
    this.nodes.clear();
    this.rendered.clear();
    for (const texture of this.iconTextures.values()) texture.destroy(true);
    this.iconTextures.clear();
    destroyTree(this.container);
  }
}
