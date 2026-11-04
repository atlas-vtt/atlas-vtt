import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ShownEntry } from './LogState.ts';

/** This close to the end, the list follows what arrives. */
const PIN_DISTANCE = 24;

export interface LogScroll {
  /** The element that scrolls, and the one inside it that holds the rows. */
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly rowsRef: RefObject<HTMLDivElement | null>;
  /** Messages and rolls that arrived below while the viewer reads older ones. */
  readonly pending: number;
  /** Whether to offer the way down: something arrived below, or the end is more than a screen away. */
  readonly away: boolean;
  readonly onScroll: () => void;
  /** Scrolls to the end and follows it again. */
  readonly jump: () => void;
  /** Scrolls an entry's row into the middle of the list; false where the list does not hold it. */
  readonly center: (id: string) => boolean;
}

interface Place {
  readonly pinned: boolean;
  readonly far: boolean;
  readonly pending: number;
}

const AT_END: Place = { pinned: true, far: false, pending: 0 };

const isNews = (entry: ShownEntry): boolean => entry.kind === 'chat' || entry.kind === 'roll' || entry.kind === 'secret';

/**
 * Where the list stands: it follows its end while the viewer is within `PIN_DISTANCE` of it (new
 * rows, a row that grows, a list that shrinks under a growing message field), and counts what
 * arrives below otherwise. What the viewer sends or rolls always scrolls down, and so does a
 * change of what the list shows (`showing`: null for the whole log, a thread's root).
 */
export function useLogScroll(entries: readonly ShownEntry[], self: string | null, showing: string | null = null): LogScroll {
  const listRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const known = useRef<ReadonlySet<string> | null>(null);
  const shownView = useRef(showing);
  const [place, setPlace] = useState(AT_END);

  const toEnd = useCallback((): void => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, []);

  const jump = useCallback((): void => {
    pinned.current = true;
    toEnd();
    setPlace(AT_END);
  }, [toEnd]);

  useLayoutEffect(() => {
    const before = known.current;
    known.current = new Set(entries.map((entry) => entry.id));
    if (before === null) return toEnd();
    if (shownView.current !== showing) {
      shownView.current = showing;
      return jump();
    }
    const added = entries.filter((entry) => !before.has(entry.id));
    if (pinned.current || added.some((entry) => isNews(entry) && entry.who === self)) return jump();
    const news = added.filter(isNews).length;
    if (news > 0) setPlace((now) => ({ ...now, pending: now.pending + news }));
  }, [entries, self, showing, jump, toEnd]);

  useEffect(() => {
    const list = listRef.current;
    const rows = rowsRef.current;
    const view = list?.ownerDocument.defaultView;
    if (list === null || rows === null || view === null || view === undefined) return undefined;
    const observer = new view.ResizeObserver(() => {
      if (pinned.current) toEnd();
    });
    observer.observe(list);
    observer.observe(rows);
    return () => observer.disconnect();
  }, [toEnd]);

  const onScroll = useCallback((): void => {
    const list = listRef.current;
    if (list === null) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    const atEnd = distance < PIN_DISTANCE;
    const far = distance > list.clientHeight;
    pinned.current = atEnd;
    setPlace((now) => {
      const pending = atEnd ? 0 : now.pending;
      return now.pinned === atEnd && now.far === far && now.pending === pending ? now : { pinned: atEnd, far, pending };
    });
  }, []);

  const center = useCallback((id: string): boolean => {
    const list = listRef.current;
    const row = Array.from(rowsRef.current?.querySelectorAll<HTMLElement>('[data-entry]') ?? []).find((element) => element.dataset.entry === id);
    if (list === null || row === undefined) return false;
    const box = list.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    const wanted = list.scrollTop + rect.top - box.top - (list.clientHeight - rect.height) / 2;
    const top = Math.max(0, Math.min(wanted, list.scrollHeight - list.clientHeight));
    if (Math.abs(top - list.scrollTop) < 1) return true;
    const calm = list.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
    // The list must not follow its end while it travels; where it comes to rest, `onScroll` says.
    pinned.current = false;
    list.scrollTo({ top, behavior: calm ? 'auto' : 'smooth' });
    return true;
  }, []);

  return { listRef, rowsRef, pending: place.pending, away: !place.pinned && (place.pending > 0 || place.far), onScroll, jump, center };
}
