import { visibleViewport } from '../../../host/visibleViewport';

/**
 * Where a tooltip stands so that it names its own control and covers nothing else of the surface it stands in
 * (a menu, the dice tray): one gap from the control, on a gap of the surface or outside it, never over another
 * control or its words. Sizes are estimated from the
 * text before the tooltip renders, since the place must be known when Radix first draws it.
 */

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipAlign = 'start' | 'center' | 'end';

export interface TooltipPlacement {
  side: TooltipSide;
  align: TooltipAlign;
  /** From the control to the tooltip along `side`. */
  offset: number;
  /** Along `side`, from the control's start edge to the tooltip's (`align` is `start`). */
  alignOffset: number;
  compact: boolean;
  /** Where the room past an edge is narrower than one line: the text wraps to this width. */
  maxWidth?: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Controls a tooltip may never lie over. */
const CONTROLS = 'button, input, select, textarea, [role="switch"], [role="radio"], [role="button"], [role="slider"], [role="tab"]';
/** The tooltip keeps this far inside the window. */
const WINDOW_MARGIN = 4;
/** How far a tooltip slides along its side, a step at a time, to clear what lies beside the control. */
const SLIDE_STEP = 4;
/** How much of its control a tooltip faces along its side, at least: half the control, at most this. */
const FACE = 16;
// tooltip.scss: 8 px padding (2 px tall compact), 1.5 px border, 13 px text at 1.4, a 20 px keycap (16 px compact) 8 px from it.
const PADDING = 8;
const COMPACT_PADDING_Y = 2;
const BORDER = 1.5;
const LINE = 13 * 1.4;
const KEYCAP = 20;
const COMPACT_KEYCAP = 16;
const KEYCAP_GAP = 8;

let measuring: OffscreenCanvasRenderingContext2D | null = null;

/** The width of `text` in `font`, measured on an offscreen canvas (where there is none, a rough 7 px a character). */
function textWidth(text: string, font: string): number {
  if (typeof OffscreenCanvas === 'undefined') return text.length * 7;
  measuring ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (!measuring) return text.length * 7;
  measuring.font = font;
  return measuring.measureText(text).width;
}

const intersects = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

/** The boxes of what a tooltip of `trigger` may not cover: the surface's other controls and its words, and the toolbar. */
function obstaclesOf(trigger: HTMLElement, surface: Element): Box[] {
  const doc = trigger.ownerDocument;
  const outsideTrigger = (element: Element): boolean => element !== trigger && !trigger.contains(element) && !element.contains(trigger);
  const controls = [...surface.querySelectorAll(CONTROLS), ...doc.querySelectorAll('.atlas-main-toolbar button')]
    .filter(outsideTrigger)
    .map((element) => element.getBoundingClientRect());
  // Words: a label, a caption, the line under a field. Those inside a control are the control's.
  const words: Box[] = [];
  const walker = doc.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || parent.closest(CONTROLS) || trigger.contains(parent)) continue;
    range.selectNodeContents(node);
    words.push(...range.getClientRects());
  }
  return [...controls, ...words].filter((box) => box.right - box.left > 0 && box.bottom - box.top > 0);
}

interface Form {
  width: number;
  height: number;
  compact: boolean;
  maxWidth?: number;
}

/**
 * The place of a tooltip of `trigger` (its `label` and `shortcut`) that stands `gap` from it and covers none
 * of the controls or words of the surface `surfaceSelector` names, nor the toolbar: on `preferred` first, then
 * the other sides, sliding along a side while it still faces the control; in full, compact, then wrapped form.
 * Null where none does: the tooltip then stays shut.
 */
export function placeTooltip(
  trigger: HTMLElement, surfaceSelector: string, preferred: TooltipSide, label: string, shortcut: string | undefined, gap: number,
): TooltipPlacement | null {
  const surface = trigger.closest(surfaceSelector);
  const win = trigger.ownerDocument.defaultView;
  if (!surface || !win) return null;
  const t = trigger.getBoundingClientRect();
  const seen = visibleViewport(win);
  const frame: Box = { left: WINDOW_MARGIN, top: WINDOW_MARGIN, right: seen.right - WINDOW_MARGIN, bottom: seen.bottom - WINDOW_MARGIN };
  const obstacles = obstaclesOf(trigger, surface);
  const free = (box: Box): boolean =>
    box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom
    && !obstacles.some((obstacle) => intersects(box, obstacle));

  const font = getComputedStyle(trigger).fontFamily;
  const text = textWidth(label, `500 13px ${font}`);
  const keycap = shortcut ? KEYCAP_GAP + Math.max(KEYCAP, textWidth(shortcut, `500 11px ${font}`) + 8) : 0;
  const chrome = keycap + 2 * PADDING + 2 * BORDER;
  const lineHeight = (compact: boolean): number =>
    Math.max(LINE, shortcut ? (compact ? COMPACT_KEYCAP : KEYCAP) : 0) + 2 * BORDER + (compact ? 2 * COMPACT_PADDING_Y : 2 * PADDING);
  const wrapped = Math.ceil(text / 2) + 16 + chrome;
  const forms: Form[] = [
    { width: text + chrome, height: lineHeight(false), compact: false },
    { width: text + chrome, height: lineHeight(true), compact: true },
    { width: wrapped, height: lineHeight(false) + LINE, compact: false, maxWidth: Math.ceil(wrapped) },
  ];

  const sides: TooltipSide[] = [...new Set<TooltipSide>([preferred, 'top', 'bottom', 'left', 'right'])];
  /** The best place for `form`: its own side first, as little slid as it can be; null where none is free. */
  const bestFor = (form: Form): TooltipPlacement | null => {
    let best: TooltipPlacement | null = null;
    let bestScore = Infinity;
    for (const side of sides) {
      const across = side === 'top' || side === 'bottom';
      const length = across ? form.width : form.height;
      const start = across ? t.left : t.top;
      const end = across ? t.right : t.bottom;
      const centred = (start + end - length) / 2;
      // It must face the control along a good part of it (half, at most 16 px), or it names nothing.
      const face = Math.min(FACE, (end - start) / 2);
      // Slide while the tooltip still faces the control: from centred towards either end.
      for (let shift = 0; shift <= length + (end - start); shift += SLIDE_STEP) {
        for (const at of shift === 0 ? [centred] : [centred - shift, centred + shift]) {
          if (Math.min(at + length, end) - Math.max(at, start) < face) continue;
          const box: Box = across
            ? { left: at, right: at + length, top: side === 'top' ? t.top - gap - form.height : t.bottom + gap, bottom: side === 'top' ? t.top - gap : t.bottom + gap + form.height }
            : { top: at, bottom: at + length, left: side === 'left' ? t.left - gap - form.width : t.right + gap, right: side === 'left' ? t.left - gap : t.right + gap + form.width };
          const score = (side === preferred ? 0 : 4) + shift / 8;
          if (score >= bestScore || !free(box)) continue;
          bestScore = score;
          best = { side, align: 'start', alignOffset: at - start, offset: gap, compact: form.compact, ...(form.maxWidth !== undefined && { maxWidth: form.maxWidth }) };
        }
      }
    }
    return best;
  };
  for (const form of forms) {
    const found = bestFor(form);
    if (found) return found;
  }
  return null;
}
