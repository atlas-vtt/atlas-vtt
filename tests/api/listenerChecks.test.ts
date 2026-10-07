import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { buildExtension } from '../../src/api/extension';
import { fakeApp, fakePlugin, fakeServices, fakeView, trackerWith } from './apiFakes';

function connected(): ReturnType<AtlasApiHost['api']['connect']> {
  const { app } = fakeApp();
  const tracker = trackerWith([fakeView('v1')]).tracker;
  const host = new AtlasApiHost({ app, capabilities: LANDED_CAPABILITIES, build: (scope) => buildExtension(scope, { ...fakeServices(app), views: tracker }) });
  return host.api.connect(fakePlugin('ext'));
}

afterEach(() => vi.restoreAllMocks());

describe('a listener that is not a function', () => {
  it('registers nothing anywhere, gets a disposer that does nothing, and is logged once naming the call', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ext = connected();
    const refused: Array<[string, () => () => void]> = [
      ['views.subscribe', () => ext.views.subscribe('v1', 'x' as never)],
      ['views.watchCamera', () => ext.views.watchCamera('v1', 1 as never)],
      ["on('unload')", () => ext.on('unload', 'later' as never)],
      ['presentation.subscribe', () => ext.presentation.subscribe('x' as never)],
      ['on: "nope"', () => ext.on('nope' as never, () => undefined)],
    ];
    for (const [call, register] of refused) {
      logged.mockClear();
      const dispose = register();
      expect(() => { dispose(); dispose(); }).not.toThrow();
      expect(logged).toHaveBeenCalledOnce();
      expect(String(logged.mock.calls[0]![0])).toContain(call);
    }
  });

});
