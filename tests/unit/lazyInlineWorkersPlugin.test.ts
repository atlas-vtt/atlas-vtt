import { describe, expect, it } from 'vitest';
import { withBlobOnFirstWorker } from '../../vite/lazy-inline-workers.mts';

/** Vite 8's wrapper of a classic inline worker (`vite:worker`'s load hook), as it reaches the transform. */
const WRAPPER = `const jsContent = "self.onmessage = () => {};";
            const blob = typeof self !== "undefined" && self.Blob && new Blob(['(self.URL || self.webkitURL).revokeObjectURL(self.location.href);',jsContent], { type: "text/javascript;charset=utf-8" });
            export default function WorkerWrapper(options) {
              let objURL;
              try {
                objURL = blob && (self.URL || self.webkitURL).createObjectURL(blob);
                if (!objURL) throw ''
                const worker = new Worker(objURL, {
          name: options?.name
        });
                return worker;
              } catch(e) {
                return new Worker('data:text/javascript;charset=utf-8,' + encodeURIComponent(jsContent), { name: options?.name });
              }
            }`;

/** Evaluates a wrapper the way the bundle does, with a Blob and Worker that count what is made. */
function evaluate(code: string): { made: () => number; start: () => unknown } {
  let blobs = 0;
  const self = {
    Blob: class { constructor() { blobs++; } },
    URL: { createObjectURL: (): string => 'blob:worker' },
  };
  class Worker { constructor(readonly url: string) {} }
  const start = new Function('self', 'Blob', 'Worker', code.replace(/^(\s*)export default function/m, '$1return function'))(self, self.Blob, Worker) as (options?: object) => unknown;
  return { made: () => blobs, start: () => start({}) };
}

describe('inline workers whose code becomes a Blob only when a worker starts', () => {
  it('makes no Blob while the bundle is evaluated, and one for every later worker', () => {
    const before = evaluate(WRAPPER);
    expect(before.made()).toBe(1);

    const after = evaluate(withBlobOnFirstWorker(WRAPPER));
    expect(after.made()).toBe(0);
    expect(after.start()).toMatchObject({ url: 'blob:worker' });
    after.start();
    expect(after.made()).toBe(1);
  });

  it('leaves alone the wrapper of a worker that this worker starts in turn', () => {
    const outer = WRAPPER.replace('"self.onmessage = () => {};"', JSON.stringify(WRAPPER));
    const after = evaluate(withBlobOnFirstWorker(outer));
    expect(after.made()).toBe(0);
    after.start();
    expect(after.made()).toBe(1);
  });

  it('refuses a wrapper it does not know', () => {
    expect(() => withBlobOnFirstWorker(WRAPPER.replace('const blob =', 'const theBlob ='))).toThrow(/review vite\/lazy-inline-workers/);
  });
});
