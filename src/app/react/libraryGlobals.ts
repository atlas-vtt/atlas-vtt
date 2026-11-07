import { motion } from 'framer-motion';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/** What `takeLibraryGlobals` learnt: React's mark for the nodes it listens on, and how to undo framer-motion's listeners. */
export interface LibraryGlobals {
  reactMarker: string | null;
  removals: Array<() => void>;
}

/** Puts `value` in place of `target[key]` until the returned function puts the original back. */
function shadow(target: object, key: string, value: unknown): () => void {
  const own = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  return () => {
    if (own) Object.defineProperty(target, key, own);
    else Reflect.deleteProperty(target, key);
  };
}

/** Notes every listener added to `win` and to the media queries it hands out while `run` runs, with how to remove it. */
function noteListeners(win: Window, removals: Array<() => void>, run: () => void): void {
  const restores: Array<() => void> = [];
  const add = win.addEventListener.bind(win);
  restores.push(shadow(win, 'addEventListener', (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void => {
    if (!listener) return;
    add(type, listener, options);
    removals.push(() => win.removeEventListener(type, listener, options));
  }));
  // A window without media queries (a test DOM) has none to note.
  const match = typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : null;
  if (match) restores.push(shadow(win, 'matchMedia', (query: string): MediaQueryList => {
    const list = match(query);
    // framer-motion calls the old `addListener`, which is `addEventListener('change', …)` by the standard.
    restores.push(shadow(list, 'addListener', (listener: ((event: MediaQueryListEvent) => void) | null): void => {
      if (!listener) return;
      list.addEventListener('change', listener);
      removals.push(() => list.removeEventListener('change', listener));
    }));
    return list;
  }));
  try {
    run();
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

/**
 * React and framer-motion each put listeners on the page once per loaded copy and never remove them:
 * React a `selectionchange` on the document of its first root or portal, framer-motion a `resize` on the
 * window and a `prefers-reduced-motion` media query listener when its first element mounts. Any of them
 * keeps that copy of Atlas in memory after Atlas unloads. This mounts one motion element in a document of
 * its own, before anything else of Atlas renders: it reads the property React marks the nodes it listens
 * on with (`_reactListening` and a key of this copy), and notes what framer-motion adds to the window
 * meanwhile, so `releaseLibraryGlobals` can remove it. The document is scratch, so React's own
 * `selectionchange` lands there.
 */
export function takeLibraryGlobals(win: Window = window): LibraryGlobals {
  const scratch = win.document.implementation.createHTMLDocument('');
  const container = scratch.body.createDiv();
  const root = createRoot(container);
  const reactMarker = Object.keys(container).find((key) => key.startsWith('_reactListening')) ?? null;
  const removals: Array<() => void> = [];
  try {
    noteListeners(win, removals, () => flushSync(() => root.render(createElement(motion.div))));
  } finally {
    root.unmount();
  }
  return { reactMarker, removals };
}

/**
 * Keeps React from listening on `doc` itself: its `selectionchange` there is the one listener of a root or
 * portal that is not on the element it renders into. React reads it only for `onSelect`, which it also
 * reads from key and mouse events, and Atlas uses none.
 */
export function keepReactOffDocument(globals: LibraryGlobals, doc: Document): void {
  if (globals.reactMarker !== null) Reflect.set(doc, globals.reactMarker, true);
}

/** Removes framer-motion's listeners and React's mark from the documents it was set on. */
export function releaseLibraryGlobals(globals: LibraryGlobals, docs: Iterable<Document>): void {
  for (const remove of globals.removals.splice(0)) remove();
  if (globals.reactMarker === null) return;
  for (const doc of docs) Reflect.deleteProperty(doc, globals.reactMarker);
}
