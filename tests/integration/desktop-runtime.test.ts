import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import type * as Runtime from '../fixtures/desktop-runtime';

let code: string;
let runtime: typeof Runtime;
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const { window } = dom;
const { document, navigator } = window;
afterAll(() => window.close());

/** Obsidian's mobile apps have no Node: the bundle may ask its host for nothing. */
function hostRequire(name: string): never {
  throw new Error(`The runtime bundle asked its host for "${name}"`);
}

beforeAll(async () => {
  const output = await build({
    configFile: 'vite.config.mts',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      lib: { entry: 'tests/fixtures/desktop-runtime.ts', formats: ['cjs'], fileName: 'runtime' },
      // Rolldown keeps JSDoc in an unminified bundle, and pako's shows `require('pako')` as an example.
      rolldownOptions: { output: { comments: { jsdoc: false } } },
    },
  });
  const bundle = Array.isArray(output) ? output[0] : output;
  if (!bundle || !('output' in bundle)) throw new Error('Expected an in-memory runtime bundle');
  const chunk = bundle.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing runtime chunk');
  code = chunk.code;
  const exports = {};
  runInNewContext(code, {
    exports, module: { exports }, require: hostRequire, window, document, navigator, console,
    setTimeout, clearTimeout, queueMicrotask, performance, Promise,
    Uint8Array, ArrayBuffer, Blob, MessageChannel,
  });
  runtime = exports as typeof Runtime;
}, 30_000);

describe('desktop dependency bundle', () => {
  it('omits script-element creation and legacy code-generating ZIP fallbacks', () => {
    expect(/createElement\(\s*["']script["']/.test(code)).toBe(false);
    expect(/new Function\s*\(/.test(code)).toBe(false);
  });

  it('names no module for its host to load', () => {
    expect(code.match(/\brequire\(\s*["'`][^"'`]*["'`]\s*\)/g) ?? []).toEqual([]);
  });

  it('renders interactive React content', () => {
    const host = document.createElement('div');
    const root = runtime.createRoot(host);
    const onClick = vi.fn();
    try {
      runtime.flushSync(() => root.render(runtime.createElement('button', { onClick }, 'Atlas')));
      expect(host.textContent).toBe('Atlas');
      host.querySelector('button')!.click();
      expect(onClick).toHaveBeenCalledOnce();
    } finally {
      root.unmount();
    }
  });

  it.each(['classic', 'module'])('rejects %s script loading without inserting a script', (type) => {
    const before = document.querySelectorAll('script').length;
    expect(() => type === 'classic'
      ? runtime.preinit('https://example.com/atlas-runtime.js', { as: 'script' })
      : runtime.preinitModule('https://example.com/atlas-runtime.mjs'),
    ).toThrow('Atlas does not support script elements');
    expect(document.querySelectorAll('script')).toHaveLength(before);
  });

  it('rejects script components through React error handling', () => {
    const host = document.createElement('div');
    const onUncaughtError = vi.fn();
    const root = runtime.createRoot(host, { onUncaughtError });
    try {
      runtime.flushSync(() => root.render(runtime.createElement('script', {}, 'alert(1)')));
      expect(onUncaughtError).toHaveBeenCalled();
      expect(onUncaughtError.mock.calls[0]?.[0]?.message).toBe('Atlas does not support script elements');
      expect(host.querySelector('script')).toBeNull();
    } finally {
      root.unmount();
    }
  });

  it('round-trips compressed ZIP metadata and binary assets without Node', async () => {
    const zip = new runtime.JSZip();
    zip.file('metadata.json', JSON.stringify({ name: 'My campaign', version: 1 }));
    zip.file('assets/token.bin', new Uint8Array([0, 1, 127, 255]));
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const restored = await runtime.JSZip.loadAsync(data);
    expect(JSON.parse(await restored.file('metadata.json')!.async('string'))).toEqual({ name: 'My campaign', version: 1 });
    expect(Array.from(await restored.file('assets/token.bin')!.async('uint8array'))).toEqual([0, 1, 127, 255]);
  });

  it('writes a streamed blob with progress and reads it back, as bundle export and import do', async () => {
    const zip = new runtime.JSZip();
    zip.file('collection.json', JSON.stringify({ name: 'Cairn' }));
    zip.file('assets/map.bin', new Uint8Array([9, 8, 7]));
    const progress: number[] = [];
    const blob = await zip.generateAsync({ type: 'blob', streamFiles: true }, ({ percent }) => progress.push(percent));
    expect(progress.at(-1)).toBe(100);
    const restored = await runtime.JSZip.loadAsync(await blob.arrayBuffer());
    expect(await restored.file('collection.json')!.async('string')).toBe('{"name":"Cairn"}');
    expect(Array.from(new Uint8Array(await restored.file('assets/map.bin')!.async('arraybuffer')))).toEqual([9, 8, 7]);
    expect(Array.from(new Uint8Array(await (await restored.file('assets/map.bin')!.async('blob')).arrayBuffer()))).toEqual([9, 8, 7]);
  });

  it('keeps the many chunks of a large archive in order', async () => {
    const zip = new runtime.JSZip();
    const large = Uint8Array.from({ length: 600_000 }, (_, index) => (index * 31) % 251);
    zip.file('map.bin', large);
    zip.file('second.bin', large.subarray(0, 100_000));
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const restored = await runtime.JSZip.loadAsync(data);
    expect(await restored.file('map.bin')!.async('uint8array')).toEqual(large);
    expect(await restored.file('second.bin')!.async('uint8array')).toEqual(large.subarray(0, 100_000));
  });
});
