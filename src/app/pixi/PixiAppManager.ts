import { Application, Ticker, type ApplicationOptions } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { SmoothDecelerate } from "./SmoothDecelerate";
import { RenderScheduler } from "./RenderScheduler";
import { destroyTree } from "./utils/destroyTree";
import { usesCanvasRenderer } from "./utils/rendererType";
import { webglAvailable } from "./utils/webglAvailable";
import { showSoftwareRenderingNotice } from "./softwareRenderingNotice";

type RendererPreference = 'webgl' | 'canvas';

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

  /**
   * `throughBackBuffer`: WebGL draws through a multisampled back buffer and the canvas gets no
   * samples. For a view that will light its scenes: dynamic lighting needs the back buffer anyway
   * and from resolution 2 draws it plain (`BackBufferHold`), so samples on the canvas were 190 to
   * 250 MB of graphics memory nothing drew into. Unlit, the back buffer costs about 80 MB more
   * than samples on the canvas, so a view without dynamic lighting keeps those.
   */
  constructor(initialWidth: number, initialHeight: number, private readonly throughBackBuffer = false) {
    this.width = initialWidth;
    this.height = initialHeight;
    this.canvasEl = createEl('canvas');
    this.app = new Application();
  }

  async init(containerEl: HTMLElement): Promise<void> {
    if (this._isDestroyed) {
      console.warn("[PixiAppManager] init called on destroyed instance.");
      return;
    }
    try {
      await this.initRenderer();
      if (usesCanvasRenderer(this.app.renderer)) showSoftwareRenderingNotice();

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
   * Atlas ships GLSL shaders only; without WebGL it draws with Canvas 2D instead of WebGPU.
   * PIXI picks Canvas 2D by itself only when WebGL is missing at its first check, whose answer
   * it keeps, so Atlas asks again before every start (`webglAvailable`) and goes straight to
   * Canvas 2D when WebGL is gone: PIXI never builds a WebGL renderer that cannot start.
   *
   * Should WebGL fail to start all the same, Canvas 2D gets one try of its own, on a new
   * canvas, since one that was asked for WebGL may never give a 2D context. PIXI keeps no
   * reference to the renderer whose start threw, so that one cannot be destroyed: its
   * scheduler stays on PIXI's system ticker, with nothing to do.
   */
  private async initRenderer(): Promise<void> {
    if (!webglAvailable()) {
      await this.app.init(this.rendererOptions(['canvas']));
      return;
    }
    try {
      await this.app.init(this.rendererOptions(['webgl', 'canvas']));
    } catch (error) {
      console.error('[PixiAppManager] WebGL could not start, drawing with Canvas 2D instead:', error);
      this.canvasEl = createEl('canvas');
      await this.app.init(this.rendererOptions(['canvas']));
    }
  }

  private rendererOptions(preference: RendererPreference[]): Partial<ApplicationOptions> {
    return {
      preference,
      canvas: this.canvasEl,
      width: this.width,
      height: this.height,
      backgroundColor: 0xf4e8d0, // Default parchment color
      backgroundAlpha: 1,
      antialias: true,
      useBackBuffer: this.throughBackBuffer,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
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
        minScale: 0.1,
        maxScale: 5,
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
   * A pane without a size is hidden (`display: none` while another Obsidian tab covers it), and
   * the screen keeps the size it had. PIXI leaves the canvas as it is for a side of 0, but the
   * viewport would take it, and whatever is placed by the screen's centre, such as the camera
   * players are frozen on, would be placed by the canvas' corner.
   */
  resize(newWidth: number, newHeight: number): void {
    if (this._isDestroyed || newWidth <= 0 || newHeight <= 0) return;
    this.width = newWidth;
    this.height = newHeight;

    if (this.app.renderer) {
      this.app.renderer.resize(newWidth, newHeight);
      // Resizing clears the drawing buffer
      this.renderScheduler?.requestRender();
    }

    if (this.viewport) {
      this.viewport.resize(newWidth, newHeight);
    }
    
    // Update canvas element dimensions
    if (this.canvasEl) {
      this.canvasEl.style.width = `${newWidth}px`;
      this.canvasEl.style.height = `${newHeight}px`;
    }
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