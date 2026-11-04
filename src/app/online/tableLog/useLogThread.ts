import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShownEntry } from './LogState.ts';
import { threadRoots, threadStats, type ThreadStat } from './logThreads.ts';

const NO_STATS: ReadonlyMap<string, ThreadStat> = new Map();

/** Whether an entry is news to the viewer: something said, rolled, shown or handed out by someone else. */
const isNews = (entry: ShownEntry, self: string | null): boolean => entry.kind !== 'joined' && entry.kind !== 'left' && entry.who !== self;

export interface LogThread {
  /** The root of the thread shown; null while the whole log shows. */
  readonly root: string | null;
  /** What the list shows: the thread, its root first, or the whole log. */
  readonly shown: readonly ShownEntry[];
  /** The pills of the whole log's threads; none while a thread shows. */
  readonly stats: ReadonlyMap<string, ThreadStat>;
  /** What arrived in the rest of the log since the thread was opened. */
  readonly unseen: number;
  /** Shows the thread an entry is in, and gives its root; null where the viewer holds no such entry. */
  readonly open: (id: string) => string | null;
  readonly close: () => void;
}

interface Opened {
  readonly root: string;
  /** What the log held when the thread was opened. */
  readonly seen: ReadonlySet<string>;
}

/**
 * Which thread the panel shows, and what of the log it shows then. A thread is followed by any
 * entry of it: where an older entry its root answers arrives, the thread grows upward, and it
 * closes by itself once the viewer holds none of it (deleted, cut from the log, the log cleared).
 */
export function useLogThread(entries: readonly ShownEntry[], self: string | null): LogThread {
  const [opened, setOpened] = useState<Opened | null>(null);
  const roots = useMemo(() => threadRoots(entries), [entries]);
  const latest = useRef({ roots, entries });
  useEffect(() => {
    latest.current = { roots, entries };
  });

  const root = opened === null ? null : roots.get(opened.root) ?? null;
  const shown = useMemo(() => (root === null ? entries : entries.filter((entry) => roots.get(entry.id) === root)), [entries, roots, root]);
  const stats = useMemo(() => (root === null ? threadStats(entries) : NO_STATS), [entries, root]);
  const unseen = opened === null || root === null ? 0 : entries.filter((entry) => !opened.seen.has(entry.id) && roots.get(entry.id) !== root && isNews(entry, self)).length;

  const open = useCallback((id: string): string | null => {
    const found = latest.current.roots.get(id) ?? null;
    if (found !== null) setOpened({ root: found, seen: new Set(latest.current.entries.map((entry) => entry.id)) });
    return found;
  }, []);
  const close = useCallback((): void => setOpened(null), []);

  return { root, shown, stats, unseen, open, close };
}
