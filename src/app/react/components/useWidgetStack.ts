import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';

/**
 * What the scene tabs keep beside the widgets' row before the widgets stack: one tab at its
 * smallest and the tab bar's buttons, so a row never pushes the tabs out of the view.
 */
const TAB_BAR_KEEPS = 240;
/** The delay between one card and the next as the stack spreads or gathers. */
const CARD_STAGGER_MS = 18;
const MAX_STAGGER_MS = 200;
/** How many cards of a stack show: the top one and the edges of two under it. */
const SHOWN_DEPTHS = 3;

interface WidgetStack {
  /** Holds the bar's element, which comes and goes with the widgets. */
  barRef: (bar: HTMLElement | null) => void;
  openerRef: RefObject<HTMLButtonElement | null>;
  rowsRef: (rows: HTMLElement | null) => void;
  /** How the stack lies; unset while the widgets stand in one row. */
  state: 'closed' | 'open' | undefined;
  spread: () => void;
  /** Puts this widget on top of the stack: the one the GM used last. */
  raise: (id: string) => void;
  /** `raise` for the card a click on the rows landed on. */
  raiseClicked: (event: MouseEvent<HTMLElement>) => void;
  barStyle: CSSProperties | undefined;
}

/**
 * The width of the cards in one row at their widest, as the bar shows them when active, whatever
 * it shows now: so a row that fits never turns into a stack when the pointer wakes the bar, and
 * the cards do not move. A copy is measured, since the bar's own cards may be stacked or animating;
 * a new element starts no transition, so it stands at its final size at once.
 */
function widestRow(bar: HTMLElement): number {
  const copy = bar.cloneNode(true);
  if (!copy.instanceOf(HTMLElement)) return 0;
  copy.className = 'atlas-widget-bar active atlas-widget-bar--measuring';
  copy.removeAttribute('data-stack');
  copy.removeAttribute('style');
  bar.after(copy);
  const width = copy.offsetWidth;
  copy.remove();
  return width;
}

/** The room a row of widgets has in the top bar: the view's width, less what the left end keeps. */
function roomForRow(topBar: HTMLElement): number {
  const start = topBar.querySelector<HTMLElement>(':scope > .atlas-top-bar-start');
  const keeps = start?.querySelector('.atlas-scene-tab-bar') ? TAB_BAR_KEEPS : start?.offsetWidth ?? 0;
  return topBar.clientWidth - keeps - parseFloat(getComputedStyle(topBar).columnGap);
}

/**
 * Whether the map view's widgets stand in one row or lie stacked in the corner. They stack when
 * their row does not fit beside the scene tabs, so they take one card's room on any screen, with any
 * number of tabs, and stay clear of the initiative tracker below; one widget never stacks. A click
 * on the stack spreads the cards into rows over everything for the moment the GM looks at them, and
 * a press elsewhere, Escape or focus leaving them gathers them again. Outside the top bar (a bar
 * mounted on its own) the cards simply wrap. The widget used last lies on top, the one before it
 * under it (`ids` are the cards' widgets, in the order of the rows).
 */
export function useWidgetStack(ids: readonly string[], content: unknown): WidgetStack {
  const [bar, barRef] = useState<HTMLElement | null>(null);
  const [rows, rowsRef] = useState<HTMLElement | null>(null);
  const [stacked, setStacked] = useState(false);
  const [viewWidth, setViewWidth] = useState(0);
  const [held, setHeld] = useState<{ width: number; height: number } | null>(null);
  const [recent, setRecent] = useState<readonly string[]>([]);
  const openerRef = useRef<HTMLButtonElement>(null);
  const cardsBefore = useRef<Map<Element, DOMRect> | null>(null);
  const refocus = useRef(false);
  const open = held !== null;
  const count = ids.length;

  const raise = useCallback((id: string) => {
    setRecent((current) => (current[0] === id ? current : [id, ...current.filter((other) => other !== id)]));
  }, []);

  function raiseClicked(event: MouseEvent<HTMLElement>): void {
    const path = event.nativeEvent.composedPath();
    const clicked = ids[[...event.currentTarget.children].findIndex((card) => path.includes(card))];
    if (clicked !== undefined) raise(clicked);
  }

  // The cards are the widgets' own components; their place in the stack is set on them here, where
  // React leaves it alone (`widget-bar.scss` and `main.scss` read it).
  useLayoutEffect(() => {
    const order = [...recent.filter((id) => ids.includes(id)), ...ids.filter((id) => !recent.includes(id))];
    [...(rows?.children ?? [])].forEach((card, index) => {
      card.setAttribute('data-stack-depth', String(Math.min(order.indexOf(ids[index] ?? ''), SHOWN_DEPTHS)));
    });
  }, [rows, recent, ids]);

  const remember = useCallback(() => {
    cardsBefore.current = new Map([...(rows?.children ?? [])].map((card) => [card, card.getBoundingClientRect()]));
  }, [rows]);

  const spread = useCallback(() => {
    if (!bar) return;
    remember();
    const { width, height } = bar.getBoundingClientRect();
    setHeld({ width, height });
  }, [bar, remember]);

  const gather = useCallback((returnFocus = false) => {
    remember();
    refocus.current = returnFocus;
    setHeld(null);
  }, [remember]);

  const topBar = bar?.closest<HTMLElement>('.atlas-top-bar-row') ?? null;

  const measure = useCallback(() => {
    if (!bar || !topBar) return;
    const width = topBar.clientWidth;
    // A pane another tab covers measures nothing, and says nothing about the room it has.
    if (width === 0) return;
    setViewWidth(width);
    const stacks = count > 1 && widestRow(bar) > roomForRow(topBar);
    setStacked(stacks);
    if (!stacks) setHeld(null);
  }, [bar, topBar, count]);

  useLayoutEffect(measure, [measure, content]);

  useEffect(() => {
    if (!topBar) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(topBar);
    return () => observer.disconnect();
  }, [topBar, measure]);

  useLayoutEffect(() => {
    const before = cardsBefore.current;
    cardsBefore.current = null;
    if (open) rows?.focus({ preventScroll: true });
    else if (refocus.current) openerRef.current?.focus({ preventScroll: true });
    refocus.current = false;
    if (!before || !rows || prefersReducedMotion(rows)) return;
    // The cards travel between the stack and their rows by `translate`, which leaves their tilt
    // (`transform`, a CSS transition) alone.
    [...rows.children].forEach((card, index) => {
      const from = before.get(card);
      if (!from) return;
      const to = card.getBoundingClientRect();
      card.animate(
        [{ translate: `${from.right - to.right}px ${from.top - to.top}px` }, { translate: '0 0' }],
        { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT, delay: Math.min(index * CARD_STAGGER_MS, MAX_STAGGER_MS), fill: 'backwards' },
      );
    });
  }, [open, rows]);

  useEffect(() => {
    if (!open || !rows) return undefined;
    const doc = rows.ownerDocument;
    const onElsewhere = (event: Event): void => {
      if (!event.composedPath().includes(rows)) gather();
    };
    // An input in a card uses Escape itself, to cancel its edit.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || doc.activeElement?.closest('input')) return;
      event.preventDefault();
      event.stopPropagation();
      gather(true);
    };
    doc.addEventListener('pointerdown', onElsewhere, true);
    doc.addEventListener('focusin', onElsewhere);
    doc.addEventListener('keydown', onKey, true);
    return () => {
      doc.removeEventListener('pointerdown', onElsewhere, true);
      doc.removeEventListener('focusin', onElsewhere);
      doc.removeEventListener('keydown', onKey, true);
    };
  }, [open, rows, gather]);

  const barStyle = held ? { '--atlas-widget-room': `${viewWidth}px`, ...held } as CSSProperties : undefined;
  const stackedState = open ? 'open' : 'closed';

  return { barRef, openerRef, rowsRef, state: stacked ? stackedState : undefined, spread, raise, raiseClicked, barStyle };
}
