import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import type * as Runtime from '../fixtures/desktop-runtime';

let code: string;
let runtime: typeof Runtime;
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const { window } = dom;
const { document, navigator } = window;
afterAll(() => window.close());

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
    },
  });
  const bundle = Array.isArray(output) ? output[0] : output;
  if (!bundle || !('output' in bundle)) throw new Error('Expected an in-memory runtime bundle');
  const chunk = bundle.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing runtime chunk');
  code = chunk.code;
  const exports = {};
  runInNewContext(code, {
    exports, module: { exports }, require: createRequire(import.meta.url), window, document, navigator, console,
    setTimeout, clearTimeout, queueMicrotask, performance, Promise,
    Uint8Array, ArrayBuffer, Blob,
  });
  runtime = exports as typeof Runtime;
}, 30_000);

describe('desktop dependency bundle', () => {
  it('omits script-element creation and legacy code-generating ZIP fallbacks', () => {
    expect(/createElement\(\s*["']script["']/.test(code)).toBe(false);
    expect(/new Function\s*\(/.test(code)).toBe(false);
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

  it('round-trips compressed ZIP metadata and binary assets using native desktop APIs', async () => {
    const zip = new runtime.JSZip();
    zip.file('metadata.json', JSON.stringify({ name: 'My campaign', version: 1 }));
    zip.file('assets/token.bin', new Uint8Array([0, 1, 127, 255]));
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const restored = await runtime.JSZip.loadAsync(data);
    expect(JSON.parse(await restored.file('metadata.json')!.async('string'))).toEqual({ name: 'My campaign', version: 1 });
    expect(Array.from(await restored.file('assets/token.bin')!.async('uint8array'))).toEqual([0, 1, 127, 255]);
  });
});
