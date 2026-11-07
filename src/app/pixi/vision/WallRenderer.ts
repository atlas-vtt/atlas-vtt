// src/app/pixi/vision/WallRenderer.ts

import { wallList } from '../../vision/wallList';
import { Graphics, Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { WallSegment } from '../../types/wallTypes';
import { cssColorToHexNumber } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { KindWallLayer, type KindWall } from './KindWallLayer';
import { drawDashedLine, hasKindLook } from './wallKindLook';
import { VERTEX_HANDLE_RADIUS, WallPreview } from './WallPreview';
import { levelObjects } from '../../levels/levelObjects';

/** Screen pixels: how close to a wall or a wall's end a press lands on it, never less than what is drawn. */
const HIT_TOLERANCE = 6;
const VERTEX_HIT = 12;

/**
 * Renders GM-only wall editor visuals: wall lines, door icons, vertex handles and
 * selection highlights. Lights have their own markers (`LightMarkers`).
 * Only visible while the lighting tool is active in the GM's view.
 */
export class WallRenderer {
  private container: Container;
  private wallGraphics: Graphics;
  /** The walls with a look of their own (`wallKindLook`), laid out in screen pixels. */
  private readonly kinds: KindWallLayer;
  private handleGraphics: Graphics;
  /** The chain being drawn, a freehand stroke, a door being placed. */
  readonly preview: WallPreview;
  private store: StoreApi<ViewAtlasState>;
  private selectedWallIds: Set<string> = new Set();
  private accentColor = 0x7f6df2;
  private _unsubscribe?: () => void;


  constructor(
    private readonly viewport: Viewport,
    store: StoreApi<ViewAtlasState>,
  ) {
    this.store = store;

    this.container = new Container();
    this.container.zIndex = 1100;
    this.container.sortableChildren = true;
    this.container.eventMode = 'none';
    this.container.visible = false;

    this.wallGraphics = new Graphics();
    this.handleGraphics = new Graphics();

    this.container.addChild(this.wallGraphics);
    this.kinds = new KindWallLayer(viewport);
    this.container.addChild(this.kinds.graphics);
    this.container.addChild(this.handleGraphics);
    this.preview = new WallPreview(() => this.accentColor);
    this.container.addChild(this.preview.graphics);

    viewport.addChild(this.container);

    // Redraw while shown; whoever shows it (the wall tool) owns `visible`.
    this._unsubscribe = store.subscribe((state, previous) => {
      if (this.container.visible && levelObjects(state) !== levelObjects(previous)) this.redraw(state);
    });
  }

  /** The walls that block one thing or are limited, in the colours of now. */
  private kindWalls(state: ViewAtlasState): KindWall[] {
    return wallList(levelObjects(state).walls).filter(hasKindLook).map((wall) => {
      const open = (wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true);
      return { wall, color: this.selectedWallIds.has(wall.id) ? this.accentColor : open ? 0x44dd44 : this.getWallColor(wall), alpha: open ? 0.6 : 1, hollow: wall.type === 'secret-door' };
    });
  }

  forceRedraw(): void {
    const state = this.store.getState();
    this.redraw(state);
  }

  setSelectedWalls(ids: string[]): void {
    this.selectedWallIds = new Set(ids);
    this.forceRedraw();
  }

  private redraw(state: ViewAtlasState): void {
    this.accentColor = cssColorToHexNumber(
      getComputedStyle(activeDocument.body).getPropertyValue('--interactive-accent').trim() || '#7f6df2'
    );
    this.wallGraphics.clear();
    this.handleGraphics.clear();
    for (const wall of wallList(levelObjects(state).walls)) {
      this.drawWall(wall);
    }
    this.kinds.set(this.kindWalls(state));
  }

  private drawWall(wall: WallSegment): void {
    const isSelected = this.selectedWallIds.has(wall.id);
    const accentColor = this.accentColor;
    const baseColor = this.getWallColor(wall);
    const color = isSelected ? accentColor : baseColor;

    const g = this.wallGraphics;
    const isOpen = (wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true);

    switch (hasKindLook(wall) ? 'kind' : wall.type) {
      // Drawn by `drawKindWalls`, in screen pixels.
      case 'kind':
        break;

      case 'solid':
        g.moveTo(wall.p1.x, wall.p1.y);
        g.lineTo(wall.p2.x, wall.p2.y);
        g.stroke({ width: 3, color, alpha: 1 });
        break;

      case 'door': {
        // Line only — door icons are drawn by the lighting layer
        g.moveTo(wall.p1.x, wall.p1.y);
        g.lineTo(wall.p2.x, wall.p2.y);
        g.stroke({ width: isOpen ? 1.5 : 2.5, color: isOpen ? 0x44dd44 : color, alpha: isOpen ? 0.5 : 1 });
        break;
      }

      case 'secret-door': {
        // Dashed line only — door icons are drawn by the lighting layer
        const dashColor = isOpen ? 0x44dd44 : color;
        drawDashedLine(g, wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y,
          dashColor, isOpen ? 1.5 : 2.5, 8, 5);
        break;
      }

      default:
        g.moveTo(wall.p1.x, wall.p1.y);
        g.lineTo(wall.p2.x, wall.p2.y);
        g.stroke({ width: 2, color, alpha: 1 });
    }

    // Direction arrow: shows which side light can pass through
    if (wall.direction) {
      this.drawDirectionArrow(g, wall, isSelected ? accentColor : 0xffffcc);
    }

    // Draw vertex handles
    const h = this.handleGraphics;
    const handleColor = isSelected ? accentColor : 0xffffff;
    h.circle(wall.p1.x, wall.p1.y, VERTEX_HANDLE_RADIUS);
    h.fill({ color: handleColor, alpha: 0.8 });
    h.stroke({ width: 1, color: baseColor });

    h.circle(wall.p2.x, wall.p2.y, VERTEX_HANDLE_RADIUS);
    h.fill({ color: handleColor, alpha: 0.8 });
    h.stroke({ width: 1, color: baseColor });
  }

  private getWallColor(wall: WallSegment): number {
    switch (wall.type) {
      case 'solid': return 0xaaaaaa;
      case 'door': return 0x44aaff;
      case 'secret-door': return 0xff8844;
      default: return 0xaaaaaa;
    }
  }

  /**
   * Draw a single prominent arrow at the wall midpoint showing which side
   * light passes through. Styled like a Foundry VTT directional indicator:
   * a filled arrow pointing toward the pass-through side.
   */
  private drawDirectionArrow(g: Graphics, wall: WallSegment, color: number): void {
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 10) return;

    // Normal pointing toward the pass-through side
    let nx: number, ny: number;
    if (wall.direction === 'left') {
      nx = -dy / len;
      ny = dx / len;
    } else {
      nx = dy / len;
      ny = -dx / len;
    }

    const mx = (wall.p1.x + wall.p2.x) / 2;
    const my = (wall.p1.y + wall.p2.y) / 2;

    // Tangent along wall
    const tx = dx / len;
    const ty = dy / len;

    // Arrow dimensions
    const arrowLength = 12;
    const arrowWidth = 7;

    // Arrow tip (offset from wall along normal)
    const tipX = mx + nx * arrowLength;
    const tipY = my + ny * arrowLength;

    // Arrow base corners (on the wall line, spread along tangent)
    const baseLeftX = mx - tx * arrowWidth;
    const baseLeftY = my - ty * arrowWidth;
    const baseRightX = mx + tx * arrowWidth;
    const baseRightY = my + ty * arrowWidth;

    // Stem indent (creates the notch at the arrow base)
    const stemX = mx + nx * 3;
    const stemY = my + ny * 3;

    // Draw filled arrow
    g.moveTo(tipX, tipY);
    g.lineTo(baseLeftX, baseLeftY);
    g.lineTo(stemX, stemY);
    g.lineTo(baseRightX, baseRightY);
    g.closePath();
    g.fill({ color, alpha: 0.9 });
    g.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
  }

  /** Hit-test walls at a world coordinate. Returns wall id or null. */
  hitTestWalls(worldX: number, worldY: number): string | null {
    const tolerance = Math.max(HIT_TOLERANCE, HIT_TOLERANCE / this.zoom);
    for (const wall of wallList(levelObjects(this.store.getState()).walls)) {
      if (this.pointToSegmentDist(worldX, worldY, wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y) < tolerance) {
        return wall.id;
      }
    }
    return null;
  }

  /** Hit-test wall vertex handles. Returns { wallId, vertex } or null. */
  hitTestVertices(worldX: number, worldY: number): { wallId: string; vertex: 'p1' | 'p2' } | null {
    const walls = levelObjects(this.store.getState()).walls;
    const threshold = Math.max(VERTEX_HIT, VERTEX_HIT / this.zoom);
    const thresholdSq = threshold * threshold;

    for (const wall of wallList(walls)) {
      const d1 = (worldX - wall.p1.x) ** 2 + (worldY - wall.p1.y) ** 2;
      if (d1 < thresholdSq) return { wallId: wall.id, vertex: 'p1' };

      const d2 = (worldX - wall.p2.x) ** 2 + (worldY - wall.p2.y) ** 2;
      if (d2 < thresholdSq) return { wallId: wall.id, vertex: 'p2' };
    }
    return null;
  }

  private pointToSegmentDist(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  /** The viewport's zoom: how many screen pixels a world pixel takes. */
  get zoom(): number {
    return this.viewport.scale.x;
  }

  getContainer(): Container {
    return this.container;
  }

  destroy(): void {
    this._unsubscribe?.();
    this.kinds.destroy();
    this.wallGraphics.destroy();
    this.handleGraphics.destroy();
    this.preview.destroy();
    destroyTree(this.container);
  }
}
