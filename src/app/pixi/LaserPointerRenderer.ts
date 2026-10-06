import { Application, Container, FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { SceneSource } from '../host/sceneSource';
import type { ViewState } from '../types/viewState';
import { LASER_FADE_TIME, type LaserPointerSettings } from '../tools/laserPointerSettings';
import { setCanvasCursor } from './utils/canvasCursor';
import { destroyTree } from './utils/destroyTree';
import { MAX_TRAIL_SAMPLES, type BeamPoint } from './laser/laserBeamGeometry';
import { LaserBeam, beamWidth, type LaserBeamView } from './laser/LaserBeam';
import { CanvasLaserBeam } from './laser/CanvasLaserBeam';
import { usesCanvasRenderer } from './utils/rendererType';

interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface WorldPoint {
  x: number;
  y: number;
}

/** Closest two trail points may be, in screen pixels; closer samples are mostly hand jitter. */
const MIN_POINT_SPACING = 3;
/** Wide beams keep points further apart: detail finer than the beam is invisible and costly. */
const MIN_POINT_SPACING_PER_WIDTH = 0.15;

/**
 * Renders the laser pointer: a glowing beam that follows the pointer and narrows as it
 * fades, drawn by `LaserBeam`.
 * Follows the active tool through a read-only source.
 * Handles viewport input directly (left-click when active, middle-click always).
 */
export class LaserPointerRenderer {
  private viewport: Viewport;
  private pixiApp: Application;
  private canvasEl: HTMLCanvasElement;

  private container: Container;
  private beam: LaserBeamView;

  private trailPoints: TrailPoint[] = [];
  /** Where the pointer is on the map, or null while it is off the canvas. */
  private pointer: WorldPoint | null = null;
  private isToolActive: boolean = false;
  private isPointing: boolean = false;
  private isQuickMode: boolean = false;
  /** Something besides the fading trail changed since the last frame. */
  private needsRedraw: boolean = false;
  /** The GM's colour and size, read on every draw so a change in the toolbar applies at once. */
  private readSettings: () => LaserPointerSettings;
  /** Last pointer position in screen (canvas) space, used to re-project the cursor when the viewport moves. */
  private lastPointerScreen: { x: number; y: number } | null = null;

  private tickerCallback: (() => void) | null = null;
  private unsubscribeFromSource?: () => void;
  private onCanvasLeave: () => void;

  // Bound viewport handlers (stored for cleanup)
  private onPointerDown: (e: FederatedPointerEvent) => void;
  private onPointerMove: (e: FederatedPointerEvent) => void;
  private onPointerUp: (e: FederatedPointerEvent) => void;
  private onPointerUpOutside: (e: FederatedPointerEvent) => void;
  private onViewportMoved: () => void;

  constructor(
    viewport: Viewport,
    pixiApp: Application,
    activeTool: SceneSource<ViewState['activeTool']>,
    canvasEl: HTMLCanvasElement,
    readSettings: () => LaserPointerSettings,
  ) {
    this.viewport = viewport;
    this.pixiApp = pixiApp;
    this.canvasEl = canvasEl;

    this.container = new Container();
    this.container.label = 'laser-pointer-layer';
    this.container.interactive = false;
    this.container.interactiveChildren = false;

    this.beam = usesCanvasRenderer(pixiApp.renderer) ? new CanvasLaserBeam() : new LaserBeam();
    this.container.addChild(this.beam.view);

    this.readSettings = readSettings;
    this.unsubscribeFromSource = activeTool.subscribe(tool => this.setActiveTool(tool));
    this.setActiveTool(activeTool.get());

    // Bind viewport handlers (always attached, guarded internally)
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onPointerUpOutside = this.handlePointerUpOutside.bind(this);
    this.onViewportMoved = this.handleViewportMoved.bind(this);

    viewport.on('pointerdown', this.onPointerDown);
    viewport.on('pointermove', this.onPointerMove);
    viewport.on('pointerup', this.onPointerUp);
    viewport.on('pointerupoutside', this.onPointerUpOutside);
    // Scroll-pan, pinch and decelerate move the world under a stationary pointer
    viewport.on('moved', this.onViewportMoved);

    this.onCanvasLeave = (): void => {
      this.lastPointerScreen = null;
      this.pointer = null;
      this.redraw();
    };
    this.canvasEl.addEventListener('mouseleave', this.onCanvasLeave);
  }

  private setActiveTool(tool: ViewState['activeTool']): void {
    const wasActive = this.isToolActive;
    this.isToolActive = tool === 'laser-pointer';
    if (this.isToolActive && !wasActive) {
      setCanvasCursor(this.canvasEl, 'none');
      this.redraw();
    } else if (!this.isToolActive && wasActive) {
      setCanvasCursor(this.canvasEl, 'auto');
      this.isPointing = false;
      this.redraw();
    }
  }

  public getContainer(): Container {
    return this.container;
  }

  // ── Input handling ──────────────────────────────────────────────────

  private getWorldFromPointerEvent(e: FederatedPointerEvent): WorldPoint | null {
    const global = e.global;
    if (!global) {
      return null;
    }
    const world = this.viewport.toWorld(global);
    if (!world || typeof world.x !== 'number' || typeof world.y !== 'number') {
      return null;
    }
    this.lastPointerScreen = { x: global.x, y: global.y };
    return { x: world.x, y: world.y };
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    const button: number = e.button;
    // Middle-click → quick mode regardless of active tool; left-click when the laser tool is active
    const quick = button === 1;
    if (!quick && !(button === 0 && this.isToolActive)) return;
    const world = this.getWorldFromPointerEvent(e);
    if (!world) {
      return;
    }

    if (quick) {
      this.isQuickMode = true;
      setCanvasCursor(this.canvasEl, 'none');
    }
    this.isPointing = true;
    this.trackPointer(world);
    e.stopPropagation();
  }

  private handlePointerMove(e: FederatedPointerEvent): void {
    const world = this.getWorldFromPointerEvent(e);
    if (!world) {
      return;
    }
    this.trackPointer(world);
    if (this.isPointing) {
      e.stopPropagation();
    }
  }

  /**
   * Re-projects the stationary pointer after the viewport panned or zoomed
   * underneath it, so the cursor and trail keep following the real pointer.
   */
  private handleViewportMoved(): void {
    if (!this.lastPointerScreen) {
      return;
    }
    const world = this.viewport.toWorld(this.lastPointerScreen.x, this.lastPointerScreen.y);
    this.trackPointer({ x: world.x, y: world.y });
  }

  private trackPointer(world: WorldPoint): void {
    this.pointer = world;
    if (this.isPointing) {
      this.addTrailPoint(world.x, world.y);
    }
    if (this.isPointing || this.isToolActive || this.isQuickMode) {
      this.redraw();
    }
  }

  private handlePointerUp(e: FederatedPointerEvent): void {
    const button: number = e.button;

    if (button === 1 && this.isQuickMode) {
      this.endQuickMode();
      e.stopPropagation();
      return;
    }

    if (button === 0 && this.isToolActive && this.isPointing) {
      this.isPointing = false;
      this.redraw();
      e.stopPropagation();
    }
  }

  private handlePointerUpOutside(): void {
    if (this.isQuickMode) {
      this.endQuickMode();
      return;
    }
    if (this.isPointing) {
      this.isPointing = false;
      this.redraw();
    }
  }

  private endQuickMode(): void {
    this.isQuickMode = false;
    this.isPointing = false;
    if (!this.isToolActive) {
      setCanvasCursor(this.canvasEl, 'auto');
    }
    this.redraw();
  }

  // ── Trail management ────────────────────────────────────────────────

  private addTrailPoint(x: number, y: number): void {
    // Enforce a minimum on-screen gap to avoid dense, jittery clusters at slow speeds
    const last = this.trailPoints[this.trailPoints.length - 1];
    if (last) {
      const zoom = this.viewport.scale.x || 1;
      const { halfWidth } = beamWidth(this.readSettings().size, zoom);
      const minGap = Math.max(MIN_POINT_SPACING / zoom, halfWidth * MIN_POINT_SPACING_PER_WIDTH);
      if (Math.hypot(x - last.x, y - last.y) < minGap) return;
    }

    this.trailPoints.push({ x, y, timestamp: Date.now() });
    if (this.trailPoints.length > MAX_TRAIL_SAMPLES) {
      this.trailPoints.splice(0, this.trailPoints.length - MAX_TRAIL_SAMPLES);
    }
  }

  // ── Ticker-driven rendering ─────────────────────────────────────────

  /** Draws on the next frame; the ticker keeps running while the trail fades. */
  private redraw(): void {
    this.needsRedraw = true;
    if (this.tickerCallback) return;
    this.tickerCallback = (): void => this.tick();
    this.pixiApp.ticker.add(this.tickerCallback);
  }

  private stopTicker(): void {
    if (!this.tickerCallback) return;
    this.pixiApp.ticker.remove(this.tickerCallback);
    this.tickerCallback = null;
  }

  private tick(): void {
    const now = Date.now();
    const hadTrail = this.trailPoints.length > 0;
    this.trailPoints = this.trailPoints.filter((point) => now - point.timestamp < LASER_FADE_TIME);

    if (hadTrail || this.needsRedraw) {
      this.needsRedraw = false;
      this.drawBeam(now);
    }
    if (this.trailPoints.length === 0 && !this.needsRedraw) {
      this.stopTicker();
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────────


  private drawBeam(now: number): void {
    const zoom = this.viewport.scale.x || 1;
    const { color, size } = this.readSettings();
    const width = beamWidth(size, zoom);
    const pointer = this.isToolActive || this.isQuickMode || this.isPointing ? this.pointer : null;

    const trail: BeamPoint[] = this.trailPoints.map((point) => ({
      x: point.x,
      y: point.y,
      life: 1 - (now - point.timestamp) / LASER_FADE_TIME,
    }));
    // While drawing, the beam runs up to the pointer, which stays at full strength.
    if (this.isPointing && pointer) trail.push({ ...pointer, life: 1 });
    const dot = pointer && !this.isPointing ? { ...pointer, life: 1 } : null;

    this.beam.draw({ trail, dot, pointer, color, width, zoom });
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  public destroy(): void {
    this.stopTicker();
    this.unsubscribeFromSource?.();

    this.viewport.off('pointerdown', this.onPointerDown);
    this.viewport.off('pointermove', this.onPointerMove);
    this.viewport.off('pointerup', this.onPointerUp);
    this.viewport.off('pointerupoutside', this.onPointerUpOutside);
    this.viewport.off('moved', this.onViewportMoved);
    this.canvasEl.removeEventListener('mouseleave', this.onCanvasLeave);

    this.trailPoints = [];
    destroyTree(this.container);
    this.beam.destroy();
  }
}
