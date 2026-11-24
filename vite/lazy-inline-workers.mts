import type { Plugin } from 'vite';

/** An inline worker's module, as Vite's worker plugin makes it (`?worker&inline`). */
const INLINE_WORKER = /[?&]worker&inline\b/;
/** What Vite's wrapper does when the module is evaluated, and where its worker reads the result. */
const MADE = 'const blob = typeof self !== "undefined" && self.Blob && new Blob([';
const MADE_END = '], { type: "text/javascript;charset=utf-8" });';
const READ = 'objURL = blob && (self.URL';
/** The same code as a SharedWorker, which Electron starts without Node (`src/app/utils/nodeFreeWorker.ts`). */
const SHARED = `
export function sharedWorker(options) {
  return new SharedWorker((self.URL || self.webkitURL).createObjectURL(madeBlob()), options);
}
`;
/** The worker's own code, one line of JSON: a worker that starts another holds that one's wrapper in it. */
const CONTENT = 'const jsContent = ';

function occurrences(code: string, text: string): number {
  return code.split(text).length - 1;
}

/**
 * Vite's inline worker wrapper with its Blob made when the first worker is, not when the module is.
 *
 * Every inline worker's wrapper copied its whole code (2.2 MB for all of them) into a Blob while
 * the bundle was evaluated at start, a quarter of the evaluation, though most workers start only
 * when a feature is used. Throws when the wrapper is not as expected, so an update of Vite cannot
 * change it unnoticed. Adds `sharedWorker`, which starts the same code as a SharedWorker.
 */
export function withBlobOnFirstWorker(code: string): string {
  const contentEnd = code.indexOf('\n') + 1;
  const wrapper = code.slice(contentEnd);
  if (!code.startsWith(CONTENT) || contentEnd === 0 || occurrences(wrapper, MADE) !== 1 || occurrences(wrapper, MADE_END) !== 1 || occurrences(wrapper, READ) !== 1) {
    throw new Error('Vite wraps inline workers another way now; review vite/lazy-inline-workers.mts');
  }
  return code.slice(0, contentEnd) + wrapper
    .replace(MADE, 'let blob;\nconst madeBlob = () => (blob ??= typeof self !== "undefined" && self.Blob && new Blob([')
    .replace(MADE_END, '], { type: "text/javascript;charset=utf-8" }));')
    .replace(READ, 'objURL = madeBlob() && (self.URL') + SHARED;
}

export function lazyInlineWorkers(): Plugin {
  return {
    name: 'atlas-lazy-inline-workers',
    enforce: 'post',
    transform(code, id) {
      if (!INLINE_WORKER.test(id)) return null;
      return { code: withBlobOnFirstWorker(code), map: null };
    },
  };
}
