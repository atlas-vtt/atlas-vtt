import { Application, Ticker, type ApplicationOptions } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { SmoothDecelerate } from "./SmoothDecelerate";
import { RenderScheduler } from "./RenderScheduler";
import { destroyTree } from "./utils/destroyTree";
import { addRendererSystemsByEntry } from "./utils/rendererSystems";
import { showNoGraphicsNotice } from './noGraphicsNotice';
import { MAX_ZOOM, MIN_ZOOM } from "./zoomRange";


export class PixiAppManager {
  private _isDestroyed: boolean = false;
  public app: Application;
  public viewport: Viewport | null = null;
  private renderScheduler: RenderScheduler | null = null;
  private width: number;
  private height: number;
  private canvasEl: HTMLCanvasElement;
  private _canvasContextMenuPreventer: ((e: Event) => void) | null = null;
  public onRecoverCallback?: () => void;

  constructor(initialWidth: number, initialHeight: number) {
    this.width = initialWidth;
    this.height = initialHeight;
    this.canvasEl = createEl('canvas');
    addRendererSystemsByEntry();
    this.app = new Application();
  }

  async init(containerEl: HTMLElement): Promise<void> {
    if (this._isDestroyed) {
      console.warn("[PixiAppManager] init called on destroyed instance.");
      return;
    }
    try {
      await this.initRenderer();

      this.app.stage.eventMode = 'static'; // Or 'passive'. 'static' means it can be an event target.
      this.app.stage.interactiveChildren = true;
      this.app.stage.hitArea = this.app.screen; // Ensure the stage hit area covers the screen

      this.renderScheduler = new RenderScheduler(this.app);
      this.app.ticker.start();
      // Rendering itself is driven by RenderScheduler; this only stops a destroyed app
      let errorCount = 0;
      const MAX_ERRORS = 5;
      
      this.app.ticker.add(() => { 
        // Let PixiJS handle rendering optimally instead of forcing manual renders
        if (this._isDestroyed) {
          this.app.ticker.stop();
          return;
        }
        
        // Only perform error recovery if needed, don't force render
        if (errorCount >= MAX_ERRORS) {
          console.error('[PixiAppManager] Too many errors detected, attempting recovery');
          this.app.ticker.stop();
          
          // Attempt to recover by recreating the renderer
          window.setTimeout(() => {
            if (this.onRecoverCallback) {
              this.onRecoverCallback();
            }
          }, 1000);
        }
      });
      
      containerEl.appendChild(this.canvasEl);
      Object.assign(this.canvasEl.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${this.width}px`,
        height: `${this.height}px`,
        touchAction: 'none', // Prevent touch scrolling
        userSelect: 'none'  // Prevent text selection
      });
      this.canvasEl.id = 'atlas-pixi-canvas-debug'; // For debugging

      this.initViewport(); // Initialize viewport and add to stage
      
      // Force a single render AFTER viewport is part of the stage
      if(this.app.renderer && this.app.stage) {
          this.app.renderer.render(this.app.stage);
      }

    } catch (error) {
      console.error("[PixiAppManager] Initialization error:", error);
      throw error;
    }
  }

  /**
   * Atlas draws with WebGL alone: its grid, lights, lasers and liquids are GLSL programs, and a
   * machine without WebGL (a blocklisted driver, some virtual machines) is not one it runs on.
   * When WebGL cannot start the user is told what to turn on, and the view is left without a map.
   */
  private async initRenderer(): Promise<void> {
    try {
      await this.app.init(this.rendererOptions());
    } catch (error) {
      showNoGraphicsNotice();
      throw error;
    }
  }

  private rendererOptions(): Partial<ApplicationOptions> {
    return {
      preference: 'webgl',
      canvas: this.canvasEl,
      width: this.width,
      height: this.height,
      backgroundColor: 0xf4e8d0, // Default parchment color
      backgroundAlpha: 1,
      antialias: true,
      // WebGL draws through a multisampled back buffer and the canvas gets no samples: dynamic
      // lighting needs the back buffer anyway and from resolution 2 draws it plain
      // (`BackBufferHold`), so samples on the canvas were 190 to 250 MB of graphics memory nothing
      // drew into. A scene that is not lit pays about 80 MB more than samples on the canvas would.
      useBackBuffer: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      // Asks for the faster of two graphics chips, as Foundry and Owlbear Rodeo do; Chromium on
      // Windows keeps the chip its GPU process started on whatever this says.
      powerPreference: 'high-performance',
      // The map has no accessible display objects; since PIXI 8.22 Tab would otherwise
      // switch on its accessibility layer, which walks the whole stage after every render.
      accessibilityOptions: { activateOnTab: false },
    };
  }

  public initViewport(): void {
    if (!this.app.renderer) {
        console.error("[PixiAppManager] Cannot init viewport: Pixi Application renderer not ready.");
        return;
    }
    
    // Check if viewport already exists
    if (this.viewport) {
        return;
    }
    
    this.viewport = new Viewport({
      screenWidth: this.width,
      screenHeight: this.height,
      worldWidth: 10000,
      worldHeight: 10000,
      events: this.app.renderer.events,
      // Share the app's loop instead of running a second one on Ticker.shared
      ticker: this.app.ticker,
    });

    this.app.stage.addChild(this.viewport);
    window.requestAnimationFrame(() => {
    });

    this.viewport.eventMode = 'static'; 
    this.viewport.interactiveChildren = true;
    this.viewport.sortableChildren = true; // Enable z-index sorting

    this.viewport
      .drag({ mouseButtons: 'right', pressDrag: true })
      .clampZoom({
        minScale: MIN_ZOOM,
        maxScale: MAX_ZOOM,
      });
    this.viewport.plugins.add('decelerate', new SmoothDecelerate(this.viewport));
    
    this._canvasContextMenuPreventer = (e) => e.preventDefault();
    this.canvasEl.addEventListener('contextmenu', this._canvasContextMenuPreventer);

  }

  /**
   * @deprecated Viewport recreation is no longer used - full renderer recreation is preferred
   */
  public recreateViewport(): Viewport | null {
    return this.viewport;
  }
  
  /**
   * @deprecated Viewport plugin reinitialization is no longer used - full renderer recreation is preferred
   */
  public reinitializeViewportPlugins(): void {
  }
  

  /**
   * The map keeps its centre: what was in the middle of the pane stays there when a sidebar or a
   * split changes the pane's size, so the view loses or gains the same on both sides. The
   * players' frame is centred on that point, and would slide by half of what the pane lost if
   * the pane kept its top left corner instead.
   *
   * A pane without a size is hidden (`display: none` while another Obsidian tab covers it), and
   * the screen keeps the size it had. PIXI leaves the canvas as it is for a side of 0, but the
   * viewport would take it, and with it everything that reads what the screen shows: the centre
   * kept here, and the world rectangle the players' frame is fitted to.
   */
  resize(newWidth: number, newHeight: number): void {
    if (this._isDestroyed || newWidth <= 0 || newHeight <= 0) return;
    this.width = newWidth;
    this.height = newHeight;

    if (this.app.renderer) this.app.renderer.resize(newWidth, newHeight);

    if (this.viewport) this.resizeViewport(this.viewport, newWidth, newHeight);
    
    // Update canvas element dimensions
    if (this.canvasEl) {
      this.canvasEl.style.width = `${newWidth}px`;
      this.canvasEl.style.height = `${newHeight}px`;
    }

    // Resizing clears the drawing buffer. A pane resizes from a ResizeObserver, after the frame's
    // render and before the paint: rendering only on the next tick showed a blank frame, so a
    // sidebar sliding open made the map flicker.
    if (this.app.renderer) this.renderScheduler?.renderNow();
  }

  /** Gives `viewport` its new screen around the world point that was in the middle of the old one. */
  private resizeViewport(viewport: Viewport, width: number, height: number): void {
    if (viewport.screenWidth === width && viewport.screenHeight === height) return;
    const { x, y } = viewport.center;
    viewport.resize(width, height);
    const moved = viewport.center.x !== x || viewport.center.y !== y;
    viewport.moveCenter(x, y);
    // As after a pan: what follows the camera (the laser's dot, handles, what is drawn for the screen only) follows.
    // `ensureVisible` is the viewport's name for a move of its own that keeps something in view.
    if (moved) viewport.emit('moved', { viewport, type: 'ensureVisible' });
  }

  destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;
    if (this._canvasContextMenuPreventer && this.canvasEl) {
      this.canvasEl.removeEventListener('contextmenu', this._canvasContextMenuPreventer);
      this._canvasContextMenuPreventer = null;
    }
    
    if (this.viewport) {
      try {
        this.viewport.plugins.pause('drag');
        this.viewport.plugins.pause('pinch');
        this.viewport.plugins.pause('wheel');
        this.viewport.plugins.pause('decelerate');
        destroyTree(this.viewport);
      } catch (e: unknown) {
        if (e instanceof TypeError && e.message.includes('_cancelResize')) {
            console.warn('[PixiAppManager] Viewport destroy failed with _cancelResize (known issue, suppressed): ', e.message);
        } else {
            console.warn('[PixiAppManager] Error destroying viewport:', e);
        }
      }
      this.viewport = null;
    }
    
    this.renderScheduler?.destroy();
    this.renderScheduler = null;

    const ticker = this.app?.ticker as Ticker | null;
    if (ticker && ticker.started) {
      try {
        ticker.stop();
      } catch(e) { console.warn('[PixiAppManager] Error stopping ticker:', e); }
    }

    // An app whose init failed has no renderer or resize plugin to tear down
    if (this.app?.renderer) {
      try {
        // `true` would also release PIXI's shared pools, which other open map views still use
        this.app.destroy({ removeView: true }, { children: true, texture: true });
      } catch (e) {
        console.warn('[PixiAppManager] Error destroying Pixi app:', e);
      }
    }
    
  }

  getApp(): Application {
    return this.app;
  }

  getViewport(): Viewport | null {
    return this.viewport;
  }
  
  getCanvasElement(): HTMLCanvasElement {
    return this.canvasEl;
  }
} 