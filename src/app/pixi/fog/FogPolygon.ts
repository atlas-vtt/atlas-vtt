/**
 * The fog tool's Polygon shape: corners placed click by click, shown as the fog they will leave
 * while the pointer moves, and closed by Enter, a click on the first corner or a double click.
 * Backspace takes the last corner back. Corners that make no area yet close nothing.
 */
import type * as PIXI from 'pixi.js';
import { PolygonDraft } from '../../fog/fogPolygon';
import { STROKE_COLORS } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import { DoubleClick } from '../annotations/DoubleClick';
import { closesDraft } from '../areas/areaGeometry';
import type { FogSnapping, PlaceKeys } from './FogSnapping';

/** Screen pixels. */
const EDGE = { width: 2, alpha: 0.6, closing: 0.3 } as const;
const CORNER = { radius: 3, first: 5.5 } as const;

/** What a polygon asks of the fog tool. */
export interface FogPolygonHost {
  /** Screen pixels per world pixel. */
  zoom(): number;
  /** Whether the polygon takes away when it closes: its lines are drawn in the revealing colour. */
  reveals(): boolean;
  /** Shows what the polygon will leave: `outline` is what its corners enclose, null while that is no area yet. */
  showOutline(outline: Point[] | null): void;
  /** The polygon was closed: `outline` is what it leaves. */
  commit(outline: Point[]): void;
  /** A polygon began, or ended: its keys are heard only while one is under way. */
  underWay(active: boolean): void;
}

export class FogPolygon {
  private readonly draft = new PolygonDraft();
  /** Where the next corner would land. */
  private cursor: Point | null = null;
  /** Where the pointer was last and what keys were held: a key pressed while it rests places the next corner anew. */
  private pointer: { world: Point; keys: PlaceKeys } | null = null;
  private readonly clicks = new DoubleClick();

  constructor(
    /** Where the corners placed and the edges between them are drawn. */
    private readonly outline: PIXI.Graphics,
    private readonly snapping: FogSnapping,
    private readonly host: FogPolygonHost,
  ) {}

  /** A polygon is under way: it has a corner. */
  get active(): boolean {
    return this.draft.active;
  }

  /** A press at `world` (`screen` on the canvas): places a corner, or closes the polygon on its first corner or by a double click. */
  press(world: Point, screen: Point, keys: PlaceKeys): void {
    const second = this.clicks.pressed('fog-polygon', screen);
    if (this.active && (second || closesDraft(this.draft.corners, world, this.host.zoom()))) {
      // Corners that make no area yet: the press places none, and the polygon goes on.
      this.close();
      return;
    }
    const began = !this.active;
    const corner = this.snapping.corner(world, keys, this.draft.last);
    if (!this.draft.add(corner) && began) return;
    this.pointer = { world: { x: world.x, y: world.y }, keys };
    this.cursor = corner;
    if (began) this.host.underWay(true);
    this.draw();
  }

  /** The pointer moved to `world`: the next corner follows it, and before the first the guide shows where it would land. */
  move(world: Point, keys: PlaceKeys): void {
    this.pointer = { world: { x: world.x, y: world.y }, keys };
    if (!this.active) {
      this.snapping.corner(world, keys);
      return;
    }
    const first = this.draft.first;
    if (first && closesDraft(this.draft.corners, world, this.host.zoom())) {
      this.cursor = first;
      this.snapping.mark(first);
    } else {
      this.cursor = this.snapping.corner(world, keys, this.draft.last);
    }
    this.draw();
  }

  /** Shift, Ctrl or Cmd went down or up while the pointer rests: the next corner lands as the keys now say. */
  rekey(keys: PlaceKeys): void {
    if (this.active && this.pointer) this.move(this.pointer.world, keys);
  }

  /** Closes the polygon into fog. False, and the polygon goes on, where its corners make no area yet. */
  close(): boolean {
    const outline = this.draft.close();
    if (!outline) return false;
    this.end();
    this.host.commit(outline);
    return true;
  }

  /** Takes the last corner back. False where that was its only one: the polygon is gone, and the picture the caller's to draw. */
  takeBack(): boolean {
    if (!this.active) return false;
    this.draft.takeBack();
    if (!this.active) {
      this.end();
      return false;
    }
    if (this.pointer) this.move(this.pointer.world, this.pointer.keys);
    else this.draw();
    return true;
  }

  /** Drops the polygon under way; true where there was one. The picture is the caller's to draw. */
  drop(): boolean {
    if (!this.active) return false;
    this.draft.drop();
    this.end();
    return true;
  }

  /** Shows the polygon again: what it does, the zoom or the fog under it changed. */
  draw(): void {
    if (!this.active) return;
    this.host.showOutline(this.draft.outlineWith(this.cursor));
    this.drawOutline();
  }

  /** The map was zoomed: the outline's lines are drawn as wide on screen as before. */
  rescale(): void {
    if (this.active) this.drawOutline();
  }

  private end(): void {
    this.cursor = null;
    this.outline.clear();
    this.snapping.clear();
    this.host.underWay(false);
  }

  /** The corners placed, the edges between them and to the pointer, and faintly the edge that would close them. */
  private drawOutline(): void {
    const color = this.host.reveals() ? STROKE_COLORS.erase : STROKE_COLORS.paint;
    const zoom = this.host.zoom();
    const { corners } = this.draft;
    const first = corners[0];
    const g = this.outline;
    g.clear();
    if (!first) return;
    const next = this.cursor;
    g.moveTo(first.x, first.y);
    for (const corner of corners.slice(1)) g.lineTo(corner.x, corner.y);
    if (next) g.lineTo(next.x, next.y);
    g.stroke({ width: EDGE.width / zoom, color, alpha: EDGE.alpha });
    const end = next ?? corners[corners.length - 1]!;
    if (corners.length >= 2 && end !== first) {
      g.moveTo(end.x, end.y).lineTo(first.x, first.y).stroke({ width: EDGE.width / zoom, color, alpha: EDGE.closing });
    }
    for (const corner of corners) g.circle(corner.x, corner.y, CORNER.radius / zoom);
    g.fill({ color });
    // The first corner is the one a click closes the polygon on.
    g.circle(first.x, first.y, CORNER.first / zoom).stroke({ width: EDGE.width / zoom, color, alpha: EDGE.alpha });
  }
}
