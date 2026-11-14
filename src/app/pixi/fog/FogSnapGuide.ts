/**
 * Shows what a point of a fog shape snapped to: a ring round the place, which stays in sight in
 * its middle, and along the wall or the area's edge it lies on a thin line. In the theme's accent
 * over a dark line, as wide on screen at any zoom, so it shows on a light map and on a dark one.
 * The GM's alone.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import type { FogGuideMark } from './FogSnapping';

/** Screen pixels. */
const RING = { radius: 5, width: 2, halo: 4.5 } as const;
const LINE = { width: 1.5, halo: 3.5 } as const;
const HALO = { color: 0x000000, alpha: 0.45 } as const;

const themeAccent = (): number => cssColorToHexNumber(getObsidianAccentColor());

export class FogSnapGuide {
  readonly view = new PIXI.Graphics();
  private mark: FogGuideMark | null = null;
  /** What the guide was last drawn as: a move along the grid only places it anew. */
  private drawn = '';

  private readonly onZoom = (): void => {
    if (this.view.visible) this.draw();
  };

  constructor(private readonly viewport: Viewport, private readonly accent: () => number = themeAccent) {
    this.view.eventMode = 'none';
    this.view.visible = false;
    viewport.on('zoomed', this.onZoom);
  }

  /** Shows what a point snapped to; nothing (null) for a point that lies where the pointer is. */
  show(mark: FogGuideMark | null): void {
    this.mark = mark;
    this.view.visible = mark !== null;
    if (mark) this.draw();
  }

  destroy(): void {
    this.viewport.off('zoomed', this.onZoom);
    if (!this.view.destroyed) this.view.destroy();
  }

  /** Screen pixels per world pixel. */
  private zoom(): number {
    const zoom = this.viewport.scale.x;
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  private draw(): void {
    const mark = this.mark;
    if (!mark) return;
    const { point, from, to } = mark;
    const zoom = this.zoom();
    const color = this.accent();
    // Drawn around the snapped place, which the guide is moved to: a line is where it lies from there.
    const line = from && to ? ([from.x - point.x, from.y - point.y, to.x - point.x, to.y - point.y] as const) : null;
    this.view.position.set(point.x, point.y);
    const drawn = `${zoom}|${color}|${line ? line.join(',') : ''}`;
    if (drawn === this.drawn) return;
    this.drawn = drawn;

    const g = this.view;
    g.clear();
    if (line) {
      const [fromX, fromY, toX, toY] = line;
      g.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: LINE.halo / zoom, color: HALO.color, alpha: HALO.alpha });
      g.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: LINE.width / zoom, color });
    }
    g.circle(0, 0, RING.radius / zoom).stroke({ width: RING.halo / zoom, color: HALO.color, alpha: HALO.alpha });
    g.circle(0, 0, RING.radius / zoom).stroke({ width: RING.width / zoom, color });
  }
}
