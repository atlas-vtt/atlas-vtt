import { Container, Graphics, Text, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { requestRender } from './RenderScheduler';
import { destroyTree } from './utils/destroyTree';
import { canvasBadgeTheme, type CanvasBadgeTheme } from './utils/canvasBadgeColors';
import type { WorldFrame } from '../types/playerFrame';

/** The glass on what players see now (`live`), or where they would, on a map they do not see (`ghost`). */
export type GlassLook = 'live' | 'ghost';

/** A frame's rectangle on screen, in the overlay's pixels. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How one outline is drawn: every alpha is multiplied by `strength`, and the dark line under the
 * accent is two px wider than `stroke`. Thinner outlines without ticks (frames the GM saved) take
 * an ink of their own. No outline fills its frame: the map inside keeps its own colours.
 */
interface OutlineInk {
  strength: number;
  stroke: number;
  ticks: boolean;
}

const INK: Record<GlassLook | 'saved', OutlineInk> = {
  live: { strength: 1, stroke: 2, ticks: true },
  ghost: { strength: 0.5, stroke: 2, ticks: true },
  saved: { strength: 0.6, stroke: 1.5, ticks: false },
};

/** The number on a saved frame's top-left corner, in screen px. */
const BADGE = { radius: 10, border: 1, fontSize: 11 } as const;
const BADGE_FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Widths in screen px and alphas at full strength. */
const LOOK = {
  stroke: 2,
  underAlpha: 0.35,
  /** Length of a corner tick along each edge, and its width. */
  tick: 14,
  tickWidth: 4,
  /** The dashes of where players see now, during a drag. */
  dash: 6,
  gap: 5,
} as const;

/**
 * The glass on the GM's map: the rectangle players see, in the theme's accent, drawn as a DM
 * screen overlay in screen space, so it is never part of a player frame. During a drag the place
 * players see now stays dotted (`setOrigin`); frames the GM saved lie under it, thinner and
 * numbered (`setSaved`). Redrawn when the viewport moves or zooms, when the
 * frames change and when the theme does (`redraw` for what it cannot hear of itself).
 */
export class GlassOutline {
  private readonly root = new Container();
  private readonly graphics = new Graphics();
  private readonly badges = new Container();
  /** One number per saved frame, kept between draws: only the text of a renumbered badge changes. */
  private readonly numbers: Text[] = [];
  private readonly removeOverlay: () => void;
  private readonly themeObserver: MutationObserver | null;
  private glass: { frame: WorldFrame; look: GlassLook } | null = null;
  private origin: WorldFrame | null = null;
  private saved: readonly WorldFrame[] = [];
  /** Where the saved frames lay on screen when last drawn, for `savedAt`. */
  private readonly savedRects: ScreenRect[] = [];
  private destroyed = false;

  constructor(
    private readonly app: Application,
    private readonly viewport: Viewport,
    addDmScreenOverlay: (overlay: Container) => () => void,
  ) {
    this.root.eventMode = 'none';
    this.root.addChild(this.graphics, this.badges);
    this.removeOverlay = addDmScreenOverlay(this.root);
    viewport.on('moved', this.redraw);
    viewport.on('zoomed', this.redraw);
    // A theme switch toggles the body's classes; the accent is read again at every draw
    this.themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(this.redraw) : null;
    this.themeObserver?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  setGlass(frame: WorldFrame | null, look: GlassLook = 'live'): void {
    this.glass = frame ? { frame, look } : null;
    this.redraw();
  }

  setOrigin(frame: WorldFrame | null): void {
    this.origin = frame;
    this.redraw();
  }

  /** The frames the GM saved on this map, drawn thinner, each with its number (1 for the first). */
  setSaved(frames: readonly WorldFrame[]): void {
    this.saved = frames;
    this.redraw();
  }

  /**
   * The saved frame under the screen point (x, y); -1 where none is. Where several overlap, the
   * smallest, then the last drawn: a frame inside a larger one could not be reached otherwise.
   */
  savedAt(x: number, y: number): number {
    let found = -1;
    let foundArea = Infinity;
    this.savedRects.forEach((rect, index) => {
      if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return;
      const area = rect.width * rect.height;
      if (area > foundArea) return;
      found = index;
      foundArea = area;
    });
    return found;
  }

  /** Where saved frame `index` lay on screen when last drawn. */
  savedRect(index: number): ScreenRect | undefined {
    return this.savedRects[index];
  }

  /** Where `frame` lies on screen now. */
  screenRect({ centerX, centerY, width, height }: WorldFrame): ScreenRect {
    const topLeft = this.viewport.toScreen(centerX - width / 2, centerY - height / 2);
    const bottomRight = this.viewport.toScreen(centerX + width / 2, centerY + height / 2);
    return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
  }

  readonly redraw = (): void => {
    if (this.destroyed) return;
    this.graphics.clear();
    const theme = canvasBadgeTheme();
    this.savedRects.length = 0;
    this.saved.forEach((frame) => {
      const rect = this.screenRect(frame);
      this.savedRects.push(rect);
      this.drawOutline(rect, INK.saved, theme.accent);
    });
    // The badges lie over every outline, the glass's too
    this.savedRects.forEach((rect, index) => this.drawBadge(rect, index, theme));
    this.numbers.forEach((number, index) => { number.visible = index < this.savedRects.length; });
    if (this.origin) this.drawDotted(this.screenRect(this.origin), theme.accent);
    if (this.glass) this.drawOutline(this.screenRect(this.glass.frame), INK[this.glass.look], theme.accent);
    requestRender(this.app);
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.viewport.off('moved', this.redraw);
    this.viewport.off('zoomed', this.redraw);
    this.themeObserver?.disconnect();
    this.removeOverlay();
    destroyTree(this.root);
    requestRender(this.app);
  }

  private drawOutline({ x, y, width, height }: ScreenRect, ink: OutlineInk, accent: number): void {
    const g = this.graphics;
    // A dark line under the accent holds it on a light map
    g.rect(x, y, width, height).stroke({ width: ink.stroke + 2, color: 0x000000, alpha: LOOK.underAlpha * ink.strength });
    g.rect(x, y, width, height).stroke({ width: ink.stroke, color: accent, alpha: ink.strength });
    if (!ink.ticks) return;
    const tick = Math.min(LOOK.tick, width / 3, height / 3);
    this.traceTicks(x, y, width, height, tick)
      .stroke({ width: LOOK.tickWidth + 2, color: 0x000000, alpha: LOOK.underAlpha * ink.strength, cap: 'square' });
    this.traceTicks(x, y, width, height, tick)
      .stroke({ width: LOOK.tickWidth, color: accent, alpha: ink.strength, cap: 'square' });
  }

  private drawBadge({ x, y }: ScreenRect, index: number, { background, stroke }: CanvasBadgeTheme): void {
    this.graphics.circle(x, y, BADGE.radius).fill({ color: background }).stroke({ width: BADGE.border, color: stroke });
    const number = this.numbers[index] ?? this.addNumber();
    const label = String(index + 1);
    if (number.text !== label) number.text = label;
    if (number.style.fill !== stroke) number.style.fill = stroke;
    number.position.set(x, y);
  }

  private addNumber(): Text {
    const number = new Text({
      text: '',
      anchor: 0.5,
      style: { fontFamily: BADGE_FONT, fontSize: BADGE.fontSize, fontWeight: '600' },
      resolution: Math.max(2, activeWindow.devicePixelRatio || 1),
    });
    this.numbers.push(number);
    this.badges.addChild(number);
    return number;
  }

  /** An L at each corner, `length` along both edges. */
  private traceTicks(x: number, y: number, width: number, height: number, length: number): Graphics {
    const g = this.graphics;
    const right = x + width;
    const bottom = y + height;
    return g
      .moveTo(x, y + length).lineTo(x, y).lineTo(x + length, y)
      .moveTo(right - length, y).lineTo(right, y).lineTo(right, y + length)
      .moveTo(right, bottom - length).lineTo(right, bottom).lineTo(right - length, bottom)
      .moveTo(x + length, bottom).lineTo(x, bottom).lineTo(x, bottom - length);
  }

  private drawDotted({ x, y, width, height }: ScreenRect, accent: number): void {
    const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]] as const;
    for (const [color, lineWidth, alpha] of [[0x000000, LOOK.stroke + 2, LOOK.underAlpha], [accent, LOOK.stroke, 1]] as const) {
      corners.forEach(([x1, y1], i) => {
        const [x2, y2] = corners[(i + 1) % 4]!;
        this.traceDashes(x1, y1, x2, y2);
      });
      this.graphics.stroke({ width: lineWidth, color, alpha });
    }
  }

  private traceDashes(x1: number, y1: number, x2: number, y2: number): void {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length === 0) return;
    const dx = (x2 - x1) / length;
    const dy = (y2 - y1) / length;
    for (let at = 0; at < length; at += LOOK.dash + LOOK.gap) {
      const end = Math.min(at + LOOK.dash, length);
      this.graphics.moveTo(x1 + dx * at, y1 + dy * at).lineTo(x1 + dx * end, y1 + dy * end);
    }
  }
}
