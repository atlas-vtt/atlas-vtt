import { useEffect, useMemo, useReducer, useRef } from 'react';

/** How long a row a reply pointed at stays marked. */
export const HIGHLIGHT_MS = 2500;

/** What the panel shows beyond the log itself; each names one entry at most. */
export interface LogUi {
  /** The entry the next message answers. */
  readonly replyTo: string | null;
  /** The message being edited in its place. */
  readonly editing: string | null;
  /** The row whose tools ask before deleting. */
  readonly asking: string | null;
  /** The row a finger or pen opened the tools of. */
  readonly tapped: string | null;
  /** The row a reply's quote led to. */
  readonly highlighted: string | null;
  /** The row the keyboard was on last. */
  readonly tabStop: string | null;
}

export interface LogUiActions {
  readonly reply: (id: string | null) => void;
  readonly edit: (id: string | null) => void;
  readonly ask: (id: string | null) => void;
  readonly tap: (id: string | null) => void;
  readonly highlight: (id: string) => void;
  readonly tabStop: (id: string) => void;
}

type Change = Partial<LogUi> | ((ui: LogUi) => Partial<LogUi>);

const START: LogUi = { replyTo: null, editing: null, asking: null, tapped: null, highlighted: null, tabStop: null };

function reduce(ui: LogUi, change: Change): LogUi {
  const patch = typeof change === 'function' ? change(ui) : change;
  const keys = Object.keys(patch) as (keyof LogUi)[];
  return keys.every((key) => patch[key] === ui[key]) ? ui : { ...ui, ...patch };
}

/** The panel's passing state, and the ways to change it (the same functions for the panel's life). */
export function useLogUi(): readonly [LogUi, LogUiActions] {
  const [ui, change] = useReducer(reduce, START);
  const timer = useRef<number | null>(null);

  const actions = useMemo<LogUiActions>(() => ({
    reply: (id) => change({ replyTo: id }),
    edit: (id) => change({ editing: id, asking: null }),
    ask: (id) => change({ asking: id }),
    // A second tap on the row hides its tools again; another row's tap moves them, and drops a question left open.
    tap: (id) => change((now) => (id !== null && now.tapped === id ? { tapped: null, asking: null } : { tapped: id, asking: now.asking === id ? id : null })),
    highlight: (id) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      change({ highlighted: id });
      timer.current = window.setTimeout(() => change((now) => (now.highlighted === id ? { highlighted: null } : {})), HIGHLIGHT_MS);
    },
    tabStop: (id) => change({ tabStop: id }),
  }), []);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return [ui, actions];
}
