import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { RenderLayer } from 'pixi.js';
import { drawSquareGrid } from './squareGridDrawer';
import { drawHexGrid } from './hexGridDrawer';
import { gridMarkerArmLength } from './gridLineStyle';
import type { GridBounds } from './gridLineStyle';
import { GridLines } from './gridLines';
import type { GridOptions, GridType } from './gridTypes';
import { createHexLayout, hexCellExtent, isHexGridType } from './hexGeometry';
import { cellCenterAt } from './gridDistance';
import type { HexLayout } from './hexGeometry';
import { contrastColorForSprite } from './gridContrastColor';
import { snapTokenCenter } from './gridPlacement';
import { numberCells, type CellLattice } from './cellNumbering';
import { hexLattice } from './hexLattice';
import { squareLattice } from './squareLattice';
import { CellNumberLabels, type CellNumberView } from './cellNumberLabels';
import { destroyTree } from '../pixi/utils/destroyTree';
import { applyGridMark, createMarkBacking, type GridMarkColor, type UnlitGrid } from './gridLightingMark';

export type { GridOptions, GridType };

// Tracks grid containers without modifying their types
const gridSpriteIds = new WeakMap<Container, number>();

/** Colour of every grid preview while the grid is being aligned. */
export const ALIGNMENT_GRID_COLOR = 0x00ff00;

/**
 * Manages a static grid overlay that exactly matches a background sprite,
 * staying locked under pan/zoom by the Pixi‑Viewport container.
 */
export class GridSystem implements UnlitGrid {
  /** Holds the grid lines and, on a numbered grid, the cell numbers. */
  private gridSprite: Container | null = null;
  private cellNumberLabels: CellNumberLabels | null = null;
  private readonly onViewportZoomed = (): void => {
    this.cellNumberLabels?.setView(this.numberView());
  };
  /** The map the grid overlays; null between two maps, when there is nothing to draw on. */
  private bgSprite: Sprite | null;
  private viewport: Viewport;
  private app: Application;
  private options: GridOptions;
  private layer: RenderLayer | null = null;
  private _updateDebounceTimer: number | null = null;
  private _gridSpriteInitialWorldX: number = 0;
  private _gridSpriteInitialWorldY: number = 0;
  private _gridOptionsOffsetXAtCreation: number = 0;
  private _gridOptionsOffsetYAtCreation: number = 0;
  private isDestroying: boolean = false;
  private _isCreating: boolean = false;
  private autoColor: number | null = null;
  /** Whether the lighting composite draws the grid (`UnlitGrid`). */
  private marked = false;
  private markBacking: Graphics | null = null;
  private drawnColor: GridMarkColor = { color: 0xffffff, contrasting: true };

  /**
   * @param app      – the Pixi Application
   * @param viewport – the Pixi‑Viewport instance containing your map
   * @param bgSprite – the background Sprite you want the grid to overlay
   * @param options  – grid styling options
   */
  constructor(
    app: Application,
    viewport: Viewport,
    bgSprite: Sprite,
    options: GridOptions
  ) {
    this.app = app;
    this.viewport = viewport;
    this.bgSprite = bgSprite;
    this.options = {
      ...options,
      type: options.type ?? 'square',
      size: options.size ?? 70,
      offsetX: options.offsetX ?? 0,
      offsetY: options.offsetY ?? 0,
      alpha: options.alpha ?? 0.7,
      lineWidth: options.lineWidth ?? 1,
      lineType: options.lineType ?? 'solid',
      enabled: options.enabled ?? true,
      scale: options.scale ?? 1,
    };

    this.updateMapScale();
    this.viewport.on('zoomed', this.onViewportZoomed);
    this.createGrid();
  }

  private createGrid(): void {
    if (this.isDestroying) {
      return;
    }
    if (this._isCreating) {
      window.setTimeout(() => {
        this._isCreating = false;
        this.createGrid();
      }, 100);
      return;
    }

    this._isCreating = true;
    this.destroyGridResources();
    this.createExplicitGrid();
  }

  /** Hex layout for the current options, or null for square grids. */
  private getHexLayout(): HexLayout | null {
    const { type, size, offsetX = 0, offsetY = 0 } = this.options;
    return isHexGridType(type) ? createHexLayout(type, size, offsetX, offsetY) : null;
  }

  private createExplicitGrid(): void {
    const { size, offsetX = 0, offsetY = 0, color, alpha, lineWidth, lineType = 'solid', isAligning } = this.options;

    const bgSprite = this.background;
    if (!bgSprite) {
      // `updateBackgroundSprite` builds the grid once the next map is there
      this._isCreating = false;
      return;
    }

    if (!bgSprite.width || !bgSprite.height || bgSprite.width <= 0 || bgSprite.height <= 0) {
      console.warn('[GridSystem] Background sprite not ready yet (invalid dimensions), scheduling retry', {
        width: bgSprite.width,
        height: bgSprite.height
      });
      this._isCreating = false;
      window.setTimeout(() => {
        if (!this.isDestroying) {
          this.createGrid();
        }
      }, 100);
      return;
    }

    const bgX = bgSprite.x || 0;
    const bgY = bgSprite.y || 0;
    const hexLayout = this.getHexLayout();

    // One cell of padding around the map; the mask clips the overflow.
    const padding = hexLayout ? Math.max(hexCellExtent(hexLayout).width, hexCellExtent(hexLayout).height) : size;
    const bounds: GridBounds = {
      minX: bgX - padding,
      minY: bgY - padding,
      maxX: bgX + bgSprite.width + padding,
      maxY: bgY + bgSprite.height + padding,
    };

    // `??`, not `||`: black is 0x000000 and must not fall through to the automatic colour
    const gridColor = isAligning ? ALIGNMENT_GRID_COLOR : (color ?? this.getAutoColor(bgSprite));

    const lines = new GridLines({
      lineType,
      lineWidth: lineWidth!,
      color: gridColor,
      alpha: isAligning ? Math.min(alpha! * 1.5, 1) : alpha!,
      markerArm: gridMarkerArmLength(size),
      trace: (path, thickness, arm) => {
        if (hexLayout) drawHexGrid(path, bounds, hexLayout, lineType, thickness, arm);
        else drawSquareGrid(path, bounds, size, offsetX, offsetY, lineType, thickness, arm);
      },
    });

    const grid = new Container({ label: 'grid', eventMode: 'none', interactiveChildren: false });
    grid.addChild(lines.graphics);
    grid.position.set(bounds.minX, bounds.minY);

    const cellNumbers = this.options.cellNumbers;
    if (cellNumbers) {
      const lattice: CellLattice = hexLayout ? hexLattice(hexLayout) : squareLattice(size, offsetX, offsetY);
      const mapRect = { x: bgX, y: bgY, width: bgSprite.width, height: bgSprite.height };
      this.cellNumberLabels = new CellNumberLabels(
        numberCells(lattice, mapRect, cellNumbers.format),
        lattice.size,
        { x: bounds.minX, y: bounds.minY },
        { color: gridColor, opacity: cellNumbers.opacity },
        this.numberView(),
      );
      grid.addChild(this.cellNumberLabels.container);
    }

    // Clip the grid to the map bounds. The mask is the grid's own child so it is hidden with it:
    // a visible mask whose grid is hidden is left out of PIXI's batch yet still updated in place on
    // every zoom, writing its corners over whatever took its slot (the map folded towards a pin).
    const maskGraphics = new Graphics();
    maskGraphics.rect(0, 0, bgSprite.width, bgSprite.height);
    maskGraphics.fill(0xffffff);
    maskGraphics.position.set(bgX - bounds.minX, bgY - bounds.minY);
    grid.addChild(maskGraphics);
    grid.mask = maskGraphics;
    this.markBacking = createMarkBacking(bgX - bounds.minX, bgY - bounds.minY, bgSprite.width, bgSprite.height);
    grid.addChildAt(this.markBacking, 0);
    applyGridMark(grid, this.markBacking, this.marked);
    this.drawnColor = { color: gridColor, contrasting: !isAligning && color === undefined };

    // Hidden for the players' frame too, which takes the grid as the GM sets it.
    grid.visible = this.options.enabled !== false;
    this.gridSprite = grid;
    this._gridSpriteInitialWorldX = bounds.minX;
    this._gridSpriteInitialWorldY = bounds.minY;
    this._gridOptionsOffsetXAtCreation = offsetX;
    this._gridOptionsOffsetYAtCreation = offsetY;

    // Insert just above the background
    const existingGrids = this.viewport.children.filter(child => gridSpriteIds.has(child));
    existingGrids.forEach(g => this.viewport.removeChild(g));

    const bgIndex = this.viewport.children.indexOf(bgSprite);
    this.viewport.addChildAt(grid, bgIndex >= 0 ? bgIndex + 1 : 0);
    gridSpriteIds.set(grid, Date.now());

    if (this.layer) {
      this.layer.attach(grid);
    }

    this.viewport.dirty = true;
    this._isCreating = false;
  }

  private numberView(): CellNumberView {
    return { zoom: this.viewport.scale.x, pixelRatio: this.app.renderer.resolution };
  }

  /** Black or white, whichever contrasts with the map image; cached because it reads the texture's pixels. */
  private getAutoColor(bgSprite: Sprite): number {
    this.autoColor ??= contrastColorForSprite(bgSprite);
    return this.autoColor ?? 0xffffff;
  }

  /** The map to draw on; a sprite that was destroyed elsewhere counts as none. */
  private get background(): Sprite | null {
    return this.bgSprite && !this.bgSprite.destroyed ? this.bgSprite : null;
  }

  /** Clean up grid-only resources */
  private destroyGridResources(): void {
    this.cellNumberLabels = null;
    this.markBacking = null;
    if (!this.gridSprite) return;

    this.gridSprite.visible = false;
    this.gridSprite.renderable = false;

    if (this.layer) {
      try {
        this.layer.detach(this.gridSprite);
      } catch {
        // Layer might already be destroyed
      }
    }

    if (this.gridSprite.parent) {
      try {
        this.gridSprite.parent.removeChild(this.gridSprite);
      } catch {
        // Parent might be in the middle of rendering
      }
    }

    const spriteToDestroy = this.gridSprite;
    this.gridSprite = null;

    // Destroy after the current render cycle completes
    window.requestAnimationFrame(() => {
      try {
        if (!spriteToDestroy.destroyed) {
          destroyTree(spriteToDestroy);
        }
      } catch {
        // Silently ignore destruction errors
      }
    });
  }

  setMarking(on: boolean): void {
    if (on === this.marked) return;
    this.marked = on;
    if (this.gridSprite && this.markBacking) applyGridMark(this.gridSprite, this.markBacking, on);
  }

  markColor(): GridMarkColor | null {
    return this.marked && this.gridSprite?.visible ? this.drawnColor : null;
  }

  /** Toggle visibility */
  public setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (enabled) {
      this.createGrid();
    } else if (this.gridSprite) {
      this.gridSprite.visible = false;
    }
  }

  /** Update cell size, color, alpha, etc. */
  public updateOptions(opts: Partial<GridOptions>): void {
    if (Object.keys(opts).length === 0) {
      return;
    }

    Object.assign(this.options, opts);

    if (this._updateDebounceTimer) {
      window.clearTimeout(this._updateDebounceTimer);
    }

    this._updateDebounceTimer = window.setTimeout(() => {
      if (opts.size !== undefined) {
        this.updateMapScale();
      }
      this.createGrid();
      this._updateDebounceTimer = null;
    }, 100);
  }

  /** Changes only the numbers' opacity, without rebuilding the grid. */
  public setCellNumberOpacity(opacity: number): void {
    if (!this.options.cellNumbers) return;
    this.options.cellNumbers = { ...this.options.cellNumbers, opacity };
    this.cellNumberLabels?.setOpacity(opacity);
  }

  /** Return current options */
  public getOptions(): Readonly<GridOptions> {
    return this.options;
  }

  /** Get the calculated map scale factor */
  public getMapScale(): number {
    return this.options.mapScale || 1;
  }

  /** Returns the grid container: its lines and, on a numbered grid, the cell numbers */
  public getGridSprite(): Container | null {
    return this.gridSprite;
  }

  /** Map scale is 1:1 - the grid renders at its logical size */
  private updateMapScale(): void {
    this.options.mapScale = 1;
  }

  /** Completely destroy */
  public destroy(): void {
    this.isDestroying = true;
    this.viewport.off('zoomed', this.onViewportZoomed);
    this.destroyGridResources();
  }

  /** Updates the internal reference to the background sprite */
  public updateBackgroundSprite(newBgSprite: Sprite): void {
    if (!newBgSprite) {
      console.error('[GridSystem] Cannot update background sprite: new sprite is null');
      return;
    }

    this.bgSprite = newBgSprite;
    this.autoColor = null;

    if (newBgSprite.width > 0 && newBgSprite.height > 0) {
      this.createGrid();
      return;
    }

    // Wait for the sprite's texture to load before building the grid
    const checkSpriteReady = (): void => {
      // Stop polling once the grid or this sprite is gone
      if (this.isDestroying || this.bgSprite !== newBgSprite || newBgSprite.destroyed) return;
      if (newBgSprite.width > 0 && newBgSprite.height > 0) {
        this.createGrid();
      } else {
        window.setTimeout(checkSpriteReady, 50);
      }
    };
    window.setTimeout(checkSpriteReady, 50);
  }

  /** The map was taken away: the grid goes with it until `updateBackgroundSprite` brings the next one. */
  public clearBackgroundSprite(): void {
    this.bgSprite = null;
    this.autoColor = null;
    this.destroyGridResources();
  }

  /** Provide a render layer so the grid sprite can automatically be attached */
  public setRenderLayer(layer: RenderLayer | null): void {
    this.layer = layer;
    if (this.gridSprite && layer) {
      layer.attach(this.gridSprite);
    }
  }

  /** Snap to the top-left corner of the containing square cell */
  public snapToGrid(x: number, y: number): { x: number; y: number } {
    const { size, offsetX = 0, offsetY = 0 } = this.options;
    return {
      x: Math.floor((x - offsetX) / size) * size + offsetX,
      y: Math.floor((y - offsetY) / size) * size + offsetY,
    };
  }

  /** Snap to the centre of the containing grid cell */
  public snapToCellCenter(x: number, y: number): { x: number; y: number } {
    return cellCenterAt(this.options, { x, y });
  }

  /** Snap a token's centre: a cell centre, or where cells meet for an even footprint (`tokenCenterShift`) */
  public snapTokenCenter(x: number, y: number, tokenSize: number): { x: number; y: number } {
    const { type, size } = this.options;
    return snapTokenCenter({ x, y }, tokenSize, type, size, (point) => this.snapToCellCenter(point.x, point.y));
  }

  /** Get current grid size */
  public get gridSize(): number {
    return this.options.size;
  }

  /** Set grid type */
  public setGridType(type: GridType): void {
    const oldType = this.options.type;
    this.updateOptions({ type });

    if (oldType !== type) {
      window.dispatchEvent(new CustomEvent('atlas-grid-type-changed', {
        detail: { oldType, newType: type }
      }));
    }
  }

  /** Set grid size (see GridOptions.size for the meaning per grid type) */
  public setGridSize(size: number): void {
    this.updateOptions({ size });
  }

  /** Set grid offset - optimized for real-time updates during dragging */
  public setGridOffset(offsetX: number, offsetY: number): void {
    const roundedOffsetX = Math.round(offsetX);
    const roundedOffsetY = Math.round(offsetY);

    this.options.offsetX = roundedOffsetX;
    this.options.offsetY = roundedOffsetY;

    if (!this.gridSprite) return;

    // Move the existing graphics to reflect the new offset instead of redrawing
    const deltaOptionsX = roundedOffsetX - this._gridOptionsOffsetXAtCreation;
    const deltaOptionsY = roundedOffsetY - this._gridOptionsOffsetYAtCreation;
    this.gridSprite.position.set(
      this._gridSpriteInitialWorldX + deltaOptionsX,
      this._gridSpriteInitialWorldY + deltaOptionsY,
    );
    this.viewport.dirty = true;
  }

  /** Force recreation of grid with current offset - use this for final alignment */
  public recreateGridWithOffset(): void {
    if (this.options.enabled) {
      this.createGrid();
    }
  }

  /** Set grid scale */
  public setGridScale(scale: number): void {
    this.updateOptions({ scale });
  }

  /** Set map scale for grid alignment mode */
  public setMapScale(scale: number): void {
    this.options.mapScale = scale;
    const bgSprite = this.background;
    if (bgSprite) {
      if (bgSprite.texture && bgSprite.texture.source) {
        bgSprite.texture.source.scaleMode = 'linear';
      }
      bgSprite.scale.set(scale);
      this.createGrid();
    }
  }

  /** Set alignment mode for visual feedback */
  public setAlignmentMode(isAligning: boolean): void {
    this.options.isAligning = isAligning;
    if (this.options.enabled) {
      this.createGrid();
    }
  }

  /** Set grid opacity */
  public setGridOpacity(opacity: number): void {
    this.updateOptions({ alpha: opacity });
  }

  /**
   * Validate and adjust grid size according to VTT best practices
   * Minimum 50px, recommended 100px+ for optimal snapping precision
   */
  public validateGridSize(size: number): number {
    const minSize = 50;

    if (size < minSize) {
      console.warn(`Grid size ${size}px is below minimum recommended size of ${minSize}px`);
      return minSize;
    }

    return Math.round(size);
  }
}
