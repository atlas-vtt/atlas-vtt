import { describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { buildExtension } from '../../src/api/extension';
import { API_VERSION } from '../../src/api/version';
import { fakeApp, fakePlugin, fakeServices } from './apiFakes';

function host(capabilities: readonly string[] = []): { host: AtlasApiHost; triggered: ReturnType<typeof fakeApp>['triggered'] } {
  const { app, triggered } = fakeApp();
  const apiHost = new AtlasApiHost({
    app,
    capabilities: capabilities as never,
    build: (scope) => buildExtension(scope, fakeServices(app)),
  });
  return { host: apiHost, triggered };
}

describe('extension API lifecycle', () => {
  it('publishes the API with its version on api-ready', () => {
    const { host: h, triggered } = host();
    h.publish();
    expect(h.api.version).toBe(API_VERSION);
    expect(triggered).toEqual([{ name: 'atlas-vtt:api-ready', data: [h.api] }]);
  });

  it('C-life-5: has() is true only for landed capabilities', () => {
    const { host: h } = host(['views']);
    expect(h.api.has('views')).toBe(true);
    expect(h.api.has('remote-view')).toBe(false);
    expect(h.api.has('nonsense' as never)).toBe(false);
  });

  it('C-life-1: connecting again with the same id disposes the first connection', () => {
    const { host: h } = host();
    const plugin = fakePlugin('ext');
    const first = h.api.connect(plugin);
    const listener = vi.fn();
    first.on('unload', listener);
    h.api.connect(plugin);
    h.dispose();
    expect(listener).not.toHaveBeenCalled();
  });

  it('C-life-2: unloading the extension leaves no listener behind', () => {
    const { host: h } = host();
    const plugin = fakePlugin('ext');
    const extension = h.api.connect(plugin);
    const listener = vi.fn();
    extension.on('unload', listener);
    expect(h.listenerCount()).toBe(1);
    plugin.unload();
    expect(h.listenerCount()).toBe(0);
    h.dispose();
    expect(listener).not.toHaveBeenCalled();
  });

  it('C-life-3: Atlas unloading tells every extension, disposes everything, then triggers api-unload', () => {
    const { host: h, triggered } = host();
    const order: string[] = [];
    h.api.connect(fakePlugin('a')).on('unload', () => order.push('a'));
    h.api.connect(fakePlugin('b')).on('unload', () => order.push('b'));
    h.dispose();
    expect(order).toEqual(['a', 'b']);
    expect(h.listenerCount()).toBe(0);
    expect(triggered.at(-1)).toEqual({ name: 'atlas-vtt:api-unload', data: [] });
    expect(() => h.api.connect(fakePlugin('c'))).toThrow(/unloaded/);
  });

  it('scopes the extension to its manifest id', () => {
    const { host: h } = host();
    expect(h.api.connect(fakePlugin('my-extension')).id).toBe('my-extension');
  });
});

describe('connect', () => {
  it.each([
    ['undefined', undefined],
    ['an empty object', {}],
    ['a manifest without an id', { manifest: {}, register: () => undefined }],
    ['an empty id', { manifest: { id: '' }, register: () => undefined }],
    ['no register function', { manifest: { id: 'bad' } }],
  ])('refuses %s with a clear error and leaves the connections as they were', (_label, bad) => {
    const { host: h } = host();
    const listener = vi.fn();
    h.api.connect(fakePlugin('good')).on('unload', listener);
    expect(() => h.api.connect(bad as never)).toThrow(/connect\(plugin\) needs/);
    expect(h.listenerCount()).toBe(1);
    h.dispose();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a refused reconnect does not dispose the existing connection of that id', () => {
    const { host: h } = host();
    h.api.connect(fakePlugin('ext')).on('unload', () => undefined);
    expect(() => h.api.connect({ manifest: { id: 'ext' } } as never)).toThrow();
    expect(h.listenerCount()).toBe(1);
  });

  it('registers one callback per plugin however often it reconnects, and one unload clears everything', () => {
    const { host: h } = host();
    const registered: Array<() => void> = [];
    const plugin = { ...fakePlugin('ext'), register: (cleanup: () => void): void => { registered.push(cleanup); } };
    for (let i = 0; i < 5; i++) h.api.connect(plugin).on('unload', () => undefined);
    expect(registered).toHaveLength(1);
    expect(h.listenerCount()).toBe(1);
    registered[0]();
    expect(h.listenerCount()).toBe(0);
  });

  it('a plugin object that connects again after its unload registers its teardown again', () => {
    const { host: h } = host();
    const plugin = fakePlugin('ext');
    h.api.connect(plugin).on('unload', () => undefined);
    plugin.unload();
    h.api.connect(plugin).on('unload', () => undefined);
    expect(h.listenerCount()).toBe(1);
    plugin.unload();
    expect(h.listenerCount()).toBe(0);
  });

  it('an old plugin object unloading does not tear down a newer one with the same id', () => {
    const { host: h } = host();
    const oldPlugin = fakePlugin('ext');
    const newPlugin = fakePlugin('ext');
    h.api.connect(oldPlugin);
    h.api.connect(newPlugin).on('unload', () => undefined);
    oldPlugin.unload();
    expect(h.listenerCount()).toBe(1);
    newPlugin.unload();
    expect(h.listenerCount()).toBe(0);
  });

  it('an extension unloading after Atlas disposed does nothing, and a second dispose is quiet', () => {
    const { host: h, triggered } = host();
    const plugin = fakePlugin('ext');
    h.api.connect(plugin);
    h.dispose();
    h.dispose();
    plugin.unload();
    expect(triggered.filter((t) => t.name === 'atlas-vtt:api-unload')).toHaveLength(1);
  });
});
