import { Cache, Container, DynamicBitmapFont, TextStyle } from 'pixi.js';
import { cellNumberAnchor, cellNumberFontSize } from './cellNumbering';
import type { CellLattice, CellNumberFormat, MapRect } from './cellNumbering';
import { CellNumberMesh, type PlacedLabel } from './cellNumberMesh';
import { cellNumberer, type CellNumberer } from './cellNumbersInRect';
import type { GridBounds } from './gridLineStyle';
import type { Point } from './hexGeometry';

/** A rect in world units. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Glyph atlas sizes in device pixels. Labels read from the smallest atlas at
 * least as large as they appear on screen, so the GPU scales glyphs down by
 * less than 2x and plain linear filtering keeps them sharp.
 */
const RASTER_SIZES = [16, 32, 64, 128, 256] as const;
type RasterSize = (typeof RASTER_SIZES)[number];
/** Numbers smaller than this on screen (CSS pixels) are unreadable noise, so they hide until zoomed in. */
const MIN_SCREEN_FONT_SIZE = 7;
/**
 * Labels shown at once. A readable number needs a cell of at least `MIN_SCREEN_FONT_SIZE / 0.16`,
 * about 44 CSS pixels, so a 2560 × 1440 view holds some 1,900 numbered cells and even a
 * 7680 × 4320 one about 17,000: only a view larger than any screen holds more. The labels are
 * glyph quads of one mesh (`CellNumberMesh`), laid out on the CPU, so a view that would need more
 * shows none rather than stall, and the margin around the view shrinks before the labels in view go.
 */
const MAX_LABELS = 20_000;
/** How far past the view labels are made, in the view's longer side, from the largest to none. */
const REACH_MARGINS = [1, 0.5, 0.25, 0] as const;
/** Cells of `size` per world pixel², at most: a hex covers √3/2 of `size²`, a square all of it. */
const cellsPerArea = (size: number): number => 2 / (Math.sqrt(3) * size * size);

function fontName(size: RasterSize): string {
  return `atlas-cell-numbers-${size}`;
}

function rasterSizeFor(devicePixels: number): RasterSize {
  return RASTER_SIZES.find((size) => size >= devicePixels) ?? RASTER_SIZES[RASTER_SIZES.length - 1]!;
}

/**
 * A white digit atlas at one raster size, shared by every cell number. Labels
 * take the grid colour as a tint. Built like `BitmapFontManager.install`, but
 * without mipmaps: a mip level is picked for any downscale and blurs the digits.
 */
function ensureCellNumberFont(size: RasterSize): DynamicBitmapFont {
  const cacheKey = `${fontName(size)}-bitmap`;
  const cached = Cache.get<DynamicBitmapFont>(cacheKey);
  if (cached) return cached;
  const font = new DynamicBitmapFont({
    style: new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: size, fontWeight: 'bold', fill: 0xffffff }),
    overrideFill: false,
    overrideSize: false,
    mipmap: false,
    skipKerning: true,
    textureSize: Math.max(512, size * 4),
  });
  font.ensureCharacters('0123456789');
  Cache.set(cacheKey, font);
  font.once('destroy', () => Cache.remove(cacheKey));
  return font;
}

/** The name under which PIXI's own text finds the digit atlas of `size`, for tests that draw it as the oracle. */
export function cellNumberFontFamilyForTest(size: number): string {
  const rasterSize = rasterSizeFor(size);
  ensureCellNumberFont(rasterSize);
  return fontName(rasterSize);
}

export interface CellNumberLabelStyle {
  color: number;
  opacity: number;
}

/** How the viewport shows the grid: its zoom, the renderer's device pixel ratio and what it shows (null where it cannot say). */
export interface CellNumberView {
  zoom: number;
  pixelRatio: number;
  world: WorldRect | null;
}

/** The cells to number: the lattice, the map they lie on and how they are numbered. */
export interface CellNumberSource {
  lattice: CellLattice;
  map: MapRect;
  format: CellNumberFormat;
}

/**
 * The numbers of a grid, laid out in the grid container's local space for the cells in view and
 * a margin around it, as glyph quads of one mesh that a pan past the margin or a zoom lays out
 * again; none while too small to read. Numbers stay those of the whole map (`cellNumberer`).
 *
 * The margin is the view's longer side on every side: the player window renders this container
 * with its own camera (`withPlayerSafeFrame`), which frames everything the GM's view shows in
 * the window's shape, so it shows more than the view along one axis; a margin of the longer side
 * holds a frame up to 2:1 around a tall view, and more around a wide one. Thumbnails
 * (`captureSceneFrame`) show the labels made for the GM's view too, which are too small to read there.
 */
export class CellNumberLabels {
  readonly container: Container;
  private readonly numberIn: CellNumberer;
  private readonly map: GridBounds;
  private readonly size: number;
  private readonly localOrigin: Point;
  private readonly fontSize: number;
  private rasterSize: RasterSize;
  private readonly mesh: CellNumberMesh;
  /** The labels shown. */
  private shown: PlacedLabel[] = [];
  /** What the shown labels were made for: the view with its margin (unclipped) and the zoom; null to lay out at the next view. */
  private reach: { bounds: GridBounds; zoom: number } | null = null;
  private lastView: CellNumberView | null = null;

  constructor(source: CellNumberSource, localOrigin: Point, style: CellNumberLabelStyle, view: CellNumberView) {
    const { lattice, map, format } = source;
    this.numberIn = cellNumberer(lattice, map, format);
    this.map = { minX: map.x, minY: map.y, maxX: map.x + map.width, maxY: map.y + map.height };
    this.size = lattice.size;
    this.localOrigin = localOrigin;
    this.fontSize = cellNumberFontSize(lattice.size);
    this.container = new Container({ label: 'cell-numbers', eventMode: 'none', interactiveChildren: false });
    this.container.alpha = style.opacity;
    this.mesh = new CellNumberMesh(this.container, style.color);
    this.rasterSize = rasterSizeFor(this.fontSize * view.zoom * view.pixelRatio);
    this.setView(view);
  }

  /** The atlas size the labels read from, for tests that draw the oracle in the same font. */
  get rasterSizeForTest(): number {
    return this.rasterSize;
  }

  /** The texts of the labels shown. */
  get labels(): readonly string[] {
    return this.container.visible ? this.shown.map((label) => label.text) : [];
  }

  setOpacity(opacity: number): void {
    this.container.alpha = opacity;
  }

  /** Frees the labels' geometry; the container itself goes with the grid's tree. */
  destroy(): void {
    this.mesh.destroy();
  }

  private isReadable(zoom: number): boolean {
    return this.fontSize * zoom >= MIN_SCREEN_FONT_SIZE;
  }

  /** Shows the labels of the cells in and around the view, in the glyph atlas for their size on screen; none while too small to read. */
  setView(view: CellNumberView): void {
    if (this.lastView && sameView(this.lastView, view)) return;
    this.lastView = { ...view, world: view.world && { ...view.world } };

    const readable = this.isReadable(view.zoom);
    if (this.container.visible !== readable) this.container.visible = readable;
    if (!readable) {
      this.hideAll();
      return;
    }
    const rasterChanged = this.pickRaster(view);
    if (this.reach && (!view.world || !leftReach(this.reach.bounds, this.reach.zoom, view.world, view.zoom))) {
      if (rasterChanged) this.draw();
      return;
    }
    this.layOut(view);
  }

  /** Picks the atlas for the labels' size on screen; whether it changed. */
  private pickRaster({ zoom, pixelRatio }: CellNumberView): boolean {
    const rasterSize = rasterSizeFor(this.fontSize * zoom * pixelRatio);
    if (rasterSize === this.rasterSize) return false;
    this.rasterSize = rasterSize;
    return true;
  }

  /** Labels the cells of the view and as much margin around it as `MAX_LABELS` allows; none where the view alone holds more. */
  private layOut(view: CellNumberView): void {
    const world = view.world ? toBounds(view.world) : this.map;
    const region = REACH_MARGINS.map((margin) => grown(world, margin)).find((bounds) => this.cellsIn(bounds) <= MAX_LABELS);
    if (!region) {
      this.hideAll();
      this.reach = { bounds: world, zoom: view.zoom };
      return;
    }
    const onMap = clipped(region, this.map);
    const cells = onMap ? this.numberIn({ x: onMap.minX, y: onMap.minY, width: onMap.maxX - onMap.minX, height: onMap.maxY - onMap.minY }) : [];
    this.shown = cells.map((cell) => {
      const anchor = cellNumberAnchor(this.size, cell.center);
      return { text: cell.label, x: anchor.x - this.localOrigin.x, y: anchor.y - this.localOrigin.y };
    });
    this.draw();
    this.reach = { bounds: region, zoom: view.zoom };
  }

  private draw(): void {
    this.mesh.set(this.shown, ensureCellNumberFont(this.rasterSize), this.fontSize);
  }

  /** About how many cells lie in `bounds` on the map, at most. */
  private cellsIn(bounds: GridBounds): number {
    const onMap = clipped(bounds, this.map);
    if (!onMap) return 0;
    return (onMap.maxX - onMap.minX) * (onMap.maxY - onMap.minY) * cellsPerArea(this.size);
  }

  private hideAll(): void {
    if (this.shown.length === 0) return;
    this.shown = [];
    this.draw();
    this.reach = null;
  }
}

function sameView(a: CellNumberView, b: CellNumberView): boolean {
  if (a.zoom !== b.zoom || a.pixelRatio !== b.pixelRatio) return false;
  if (!a.world || !b.world) return a.world === b.world;
  return a.world.x === b.world.x && a.world.y === b.world.y && a.world.width === b.world.width && a.world.height === b.world.height;
}

function toBounds(rect: WorldRect): GridBounds {
  return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
}

/** `bounds` grown by `margin` times its longer side on every side. */
function grown(bounds: GridBounds, margin: number): GridBounds {
  const by = margin * Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return { minX: bounds.minX - by, minY: bounds.minY - by, maxX: bounds.maxX + by, maxY: bounds.maxY + by };
}

function clipped(bounds: GridBounds, to: GridBounds): GridBounds | null {
  const minX = Math.max(bounds.minX, to.minX);
  const minY = Math.max(bounds.minY, to.minY);
  const maxX = Math.min(bounds.maxX, to.maxX);
  const maxY = Math.min(bounds.maxY, to.maxY);
  return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null;
}

/** A zoom this many times in or out of the one the labels were laid out at lays them out again, since the margin was measured at that zoom. */
const RELAYOUT_ZOOM_RATIO = 1.5;

/** Whether a view has left the labels' reach, or the zoom moved away from the one they were laid out at. */
function leftReach(reach: GridBounds, reachZoom: number, view: WorldRect, zoom: number): boolean {
  const ratio = zoom / reachZoom;
  if (ratio >= RELAYOUT_ZOOM_RATIO || ratio <= 1 / RELAYOUT_ZOOM_RATIO) return true;
  return view.x < reach.minX || view.y < reach.minY || view.x + view.width > reach.maxX || view.y + view.height > reach.maxY;
}
