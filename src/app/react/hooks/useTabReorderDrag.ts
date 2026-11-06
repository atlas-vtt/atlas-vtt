import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { MOTION_NORMAL_MS } from '../../utils/motion';

/** How far the pointer travels before a press on a tab becomes a drag, so a click stays a click. */
const DRAG_THRESHOLD_PX = 4;
/** A tab dragged this close to the strip's edge scrolls it, faster the closer it comes. */
const EDGE_SCROLL_ZONE_PX = 32;
/** The fastest the strip scrolls under a dragged tab, in pixels per frame. */
const EDGE_SCROLL_MAX_PX = 12;
/** The share of a drag past the first or last tab that the tab still follows, as if on a rubber band. */
const RUBBER_BAND = 0.2;

/** Strip attribute while tabs slide: they take the transform transition (scene-tab-bar.scss). */
const REORDERING = 'reordering';
/** Tab attribute: `dragging` follows the pointer, `settling` glides into its slot after the drop. */
const REORDER = 'reorder';
const TAB_SHIFT = '--atlas-tab-shift';

interface Slot {
  el: HTMLElement;
  left: number;
  width: number;
}

interface Drag {
  id: string;
  pointerId: number;
  el: HTMLElement;
  win: Window;
  startX: number;
  startScroll: number;
  clientX: number;
  active: boolean;
  /** Every tab's resting place when the drag began, in order. */
  slots: Slot[];
  from: number;
  to: number;
  /** How far a neighbour moves to make room: the dragged tab's width and the gap after it. */
  room: number;
  frame: number;
  detach: () => void;
}

/** Moves a tab sideways from its place in the strip (`--atlas-tab-shift`, scene-tab-bar.scss); 0 puts it back. */
function shift(tab: HTMLElement, px: number): void {
  tab.setCssProps({ [TAB_SHIFT]: px ? `${px}px` : '' });
}

function tabElements(strip: HTMLElement): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>(':scope > [data-tab-id]'));
}

/**
 * Drag-to-reorder for the scene tab strip, as in browsers: past a few pixels the pressed tab
 * lifts and follows the pointer, its neighbours slide aside to show where it will land, the
 * strip scrolls when the tab reaches a cut-off edge, and on release the tab glides into its
 * slot. The order changes once, on release (`onMove`); Escape, a lost pointer or the window
 * losing focus put everything back. Positions are written straight to the elements, so a drag
 * renders nothing in React. Mouse and pen only: a touch on the strip keeps scrolling it.
 */
export function useTabReorderDrag(
  strip: HTMLElement | null,
  tabs: readonly unknown[],
  onMove: (tabId: string, toIndex: number) => void,
): (event: React.PointerEvent<HTMLElement>, tabId: string) => void {
  const drag = useRef<Drag | null>(null);
  const drop = useRef<{ id: string; left: number } | null>(null);
  const settleTimer = useRef(0);
  const onMoveRef = useRef(onMove);
  useLayoutEffect(() => {
    onMoveRef.current = onMove;
  });

  const clearSettle = useCallback((win: Window | null): void => {
    win?.clearTimeout(settleTimer.current);
    if (!strip) return;
    delete strip.dataset[REORDERING];
    for (const tab of tabElements(strip)) delete tab.dataset[REORDER];
  }, [strip]);

  /** Lets the tabs glide to where their transforms now point, then drops the motion attributes. */
  const settle = useCallback((el: HTMLElement, win: Window): void => {
    if (!strip) return;
    strip.dataset[REORDERING] = '';
    el.dataset[REORDER] = 'settling';
    for (const tab of tabElements(strip)) shift(tab, 0);
    win.clearTimeout(settleTimer.current);
    settleTimer.current = win.setTimeout(() => clearSettle(null), MOTION_NORMAL_MS + 50);
  }, [strip, clearSettle]);

  const place = useCallback((d: Drag): void => {
    if (!strip) return;
    const self = d.slots[d.from]!;
    const first = d.slots[0]!;
    const last = d.slots[d.slots.length - 1]!;
    const raw = d.clientX - d.startX + strip.scrollLeft - d.startScroll;
    const min = first.left - self.left;
    const max = last.left + last.width - self.left - self.width;
    const x = raw < min ? min + (raw - min) * RUBBER_BAND : raw > max ? max + (raw - max) * RUBBER_BAND : raw;
    shift(d.el, x);

    const centre = self.left + x + self.width / 2;
    let to = d.from;
    d.slots.forEach((slot, index) => {
      if (index === d.from) return;
      const middle = slot.left + slot.width / 2;
      let offset = 0;
      if (index > d.from && centre > middle) {
        offset = -d.room;
        to = Math.max(to, index);
      } else if (index < d.from && centre < middle) {
        offset = d.room;
        to = Math.min(to, index);
      }
      shift(slot.el, offset);
    });
    d.to = to;
  }, [strip]);

  const end = useCallback((commit: boolean): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.detach();
    d.win.cancelAnimationFrame(d.frame);
    if (!d.active) return;
    if (commit) {
      // The click that follows the release would switch to the tab; a drag is no click.
      const swallow = (event: MouseEvent): void => {
        event.stopPropagation();
        event.preventDefault();
      };
      d.win.addEventListener('click', swallow, { capture: true, once: true });
      d.win.setTimeout(() => d.win.removeEventListener('click', swallow, { capture: true }), 0);
    }
    if (commit && d.to !== d.from) {
      drop.current = { id: d.id, left: d.el.getBoundingClientRect().left };
      onMoveRef.current(d.id, d.to);
      // The new order renders before the next frame; if none came (the move was refused), glide back.
      d.win.requestAnimationFrame(() => {
        if (drop.current?.id !== d.id) return;
        drop.current = null;
        settle(d.el, d.win);
      });
      return;
    }
    settle(d.el, d.win);
  }, [settle]);

  const start = useCallback((d: Drag): void => {
    if (!strip) return;
    const els = tabElements(strip);
    d.from = els.indexOf(d.el);
    if (d.from === -1 || els.length < 2) return;
    clearSettle(d.win);
    d.slots = els.map((el) => ({ el, left: el.offsetLeft, width: el.offsetWidth }));
    const self = d.slots[d.from]!;
    const after = d.slots[d.from + 1];
    const before = d.slots[d.from - 1];
    const gap = after ? after.left - self.left - self.width : before ? self.left - before.left - before.width : 0;
    d.room = self.width + gap;
    d.to = d.from;
    d.active = true;
    d.el.setPointerCapture(d.pointerId);
    strip.dataset[REORDERING] = '';
    d.el.dataset[REORDER] = 'dragging';

    const scrollAtEdge = (): void => {
      const { left, right } = strip.getBoundingClientRect();
      const before = Math.max(0, d.clientX - left);
      const after = Math.max(0, right - d.clientX);
      const pull = before < EDGE_SCROLL_ZONE_PX ? before / EDGE_SCROLL_ZONE_PX - 1
        : after < EDGE_SCROLL_ZONE_PX ? 1 - after / EDGE_SCROLL_ZONE_PX : 0;
      if (pull !== 0) {
        const scrolled = strip.scrollLeft;
        strip.scrollLeft += pull * EDGE_SCROLL_MAX_PX;
        if (strip.scrollLeft !== scrolled) place(d);
      }
      d.frame = d.win.requestAnimationFrame(scrollAtEdge);
    };
    d.frame = d.win.requestAnimationFrame(scrollAtEdge);
  }, [strip, clearSettle, place]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>, tabId: string): void => {
    if (event.button !== 0 || event.pointerType === 'touch' || event.ctrlKey || event.metaKey || drag.current) return;
    const el = event.currentTarget;
    const win = el.ownerDocument.defaultView;
    if (!win) return;
    const onPointerMove = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.clientX = e.clientX;
      if (!d.active) {
        if (Math.abs(d.clientX - d.startX) < DRAG_THRESHOLD_PX) return;
        start(d);
        if (!d.active) return;
      }
      place(d);
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerId === drag.current?.pointerId) end(true);
    };
    const onPointerCancel = (e: PointerEvent): void => {
      if (e.pointerId === drag.current?.pointerId) end(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !drag.current?.active) return;
      e.preventDefault();
      e.stopPropagation();
      end(false);
    };
    const onBlur = (): void => end(false);
    win.addEventListener('pointermove', onPointerMove);
    win.addEventListener('pointerup', onPointerUp);
    win.addEventListener('pointercancel', onPointerCancel);
    win.addEventListener('keydown', onKeyDown, { capture: true });
    win.addEventListener('blur', onBlur);
    drag.current = {
      id: tabId,
      pointerId: event.pointerId,
      el,
      win,
      startX: event.clientX,
      startScroll: strip?.scrollLeft ?? 0,
      clientX: event.clientX,
      active: false,
      slots: [],
      from: -1,
      to: -1,
      room: 0,
      frame: 0,
      detach: () => {
        win.removeEventListener('pointermove', onPointerMove);
        win.removeEventListener('pointerup', onPointerUp);
        win.removeEventListener('pointercancel', onPointerCancel);
        win.removeEventListener('keydown', onKeyDown, { capture: true });
        win.removeEventListener('blur', onBlur);
      },
    };
  }, [strip, start, place, end]);

  // After a drop the tabs stand in their new order. The neighbours already show their new
  // places, so they lose their transforms at once; the dropped tab starts where it was let go
  // and glides into its slot (FLIP). Tabs that change under a drag (one closed) end it.
  useLayoutEffect(() => {
    const dropped = drop.current;
    drop.current = null;
    if (!strip) return;
    if (drag.current?.active) {
      end(false);
      return;
    }
    if (!dropped) return;
    const el = tabElements(strip).find((tab) => tab.dataset.tabId === dropped.id);
    const win = strip.ownerDocument.defaultView;
    delete strip.dataset[REORDERING];
    for (const tab of tabElements(strip)) shift(tab, 0);
    if (!el || !win) {
      clearSettle(win);
      return;
    }
    delete el.dataset[REORDER];
    shift(el, dropped.left - el.getBoundingClientRect().left);
    // Reading the layout commits that starting point before the transition comes back.
    el.getBoundingClientRect();
    settle(el, win);
  }, [tabs, strip, end, settle, clearSettle]);

  useEffect(() => () => {
    const d = drag.current;
    drag.current = null;
    d?.detach();
    d?.win.cancelAnimationFrame(d.frame);
    d?.win.clearTimeout(settleTimer.current);
  }, []);

  return onPointerDown;
}
