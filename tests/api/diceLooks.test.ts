import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { buildExtension } from '../../src/api/extension';
import type { DiceLookSpec } from '../../src/api/types/dice';
import { customLook, customLooks } from '../../src/app/dice3d/customLooks';
import { fakeApp, fakePlugin, fakeServices } from './apiFakes';

function host(capabilities: readonly string[] = LANDED_CAPABILITIES): AtlasApiHost {
  const { app } = fakeApp();
  return new AtlasApiHost({ app, capabilities: capabilities as never, build: (scope) => buildExtension(scope, fakeServices(app)) });
}

const spec = (fields: Partial<DiceLookSpec> = {}): DiceLookSpec => ({ id: 'fire', name: 'Fire', faces: async () => ({}), ...fields });

let hosts: AtlasApiHost[] = [];
const started = (capabilities?: readonly string[]): AtlasApiHost => {
  const made = host(capabilities);
  hosts.push(made);
  return made;
};
afterEach(() => {
  for (const made of hosts) made.dispose();
  hosts = [];
});

describe('dice.registerLook', () => {
  it('is there only with the dice-looks capability, on a frozen dice namespace', () => {
    const without = started(['dice']).api.connect(fakePlugin('ext'));
    expect(Object.hasOwn(without.dice, 'registerLook')).toBe(false);
    const api = started().api;
    expect(api.has('dice-looks')).toBe(true);
    const extension = api.connect(fakePlugin('ext'));
    expect(typeof extension.dice.registerLook).toBe('function');
    expect(Object.isFrozen(extension.dice)).toBe(true);
  });

  it('registers by full id, frozen, with the extension functions guarded; the disposer removes it once', async () => {
    const extension = started().api.connect(fakePlugin('ext'));
    const faces = vi.fn(function (this: unknown) { return Promise.resolve({ 1: 'data:image/png;base64,AA' }); });
    const dispose = extension.dice.registerLook!(spec({ faces, body: { colour: '#d33d33', ink: '#ffffff' }, preview: 'data:image/png;base64,BB' }));
    const look = customLook('ext:fire');
    expect(look).not.toBeNull();
    expect(Object.isFrozen(look)).toBe(true);
    expect(look).toMatchObject({ id: 'ext:fire', name: 'Fire', body: '#d33d33', ink: '#ffffff', preview: 'data:image/png;base64,BB' });
    await expect(look!.faces(6)).resolves.toEqual({ 1: 'data:image/png;base64,AA' });
    expect(faces).toHaveBeenCalledWith(6);
    dispose();
    dispose();
    expect(customLook('ext:fire')).toBeNull();
  });

  it("keeps fill: 'face', and 'numeral' or none as Atlas's default placement", () => {
    const extension = started().api.connect(fakePlugin('ext'));
    extension.dice.registerLook!(spec({ fill: 'face' }));
    expect(customLook('ext:fire')?.fill).toBe('face');
    extension.dice.registerLook!({ ...spec(), id: 'ice', fill: 'numeral' });
    expect(customLook('ext:ice')).not.toHaveProperty('fill');
  });

  it('a faces() that throws or rejects becomes a rejection, never a throw into Atlas', async () => {
    const extension = started().api.connect(fakePlugin('ext'));
    extension.dice.registerLook!(spec({ faces: () => { throw new Error('boom'); } }));
    extension.dice.registerLook!(spec({ id: 'ice', faces: () => Promise.reject(new Error('nope')), bump: () => { throw new TypeError('bad'); } }));
    await expect(customLook('ext:fire')!.faces(20)).rejects.toThrow('boom');
    await expect(customLook('ext:ice')!.faces(20)).rejects.toThrow('nope');
    await expect(customLook('ext:ice')!.bump!(20)).rejects.toThrow('bad');
  });

  it('reads the spec once: a later change to it changes nothing', () => {
    const extension = started().api.connect(fakePlugin('ext'));
    const given = spec();
    extension.dice.registerLook!(given);
    given.name = 'Changed';
    expect(customLook('ext:fire')?.name).toBe('Fire');
  });

  it.each([
    ['not an object', null, /DiceLookSpec/],
    ['an empty id', { id: ' ', name: 'A', faces: async () => ({}) }, /"id"/],
    ['no name', { id: 'a', faces: async () => ({}) }, /"name"/],
    ['a long name', { id: 'a', name: 'x'.repeat(65), faces: async () => ({}) }, /at most 64/],
    ['no faces', { id: 'a', name: 'A' }, /"faces"/],
    ['a bump that is no function', { id: 'a', name: 'A', faces: async () => ({}), bump: 3 }, /"bump"/],
    ['a body colour that is not #rrggbb', { id: 'a', name: 'A', faces: async () => ({}), body: { colour: 'red' } }, /body\.colour/],
    ['an ink that is not #rrggbb', { id: 'a', name: 'A', faces: async () => ({}), body: { ink: '#fff' } }, /body\.ink/],
    ['a preview that is no string', { id: 'a', name: 'A', faces: async () => ({}), preview: 4 }, /"preview"/],
    ['a fill that is neither numeral nor face', { id: 'a', name: 'A', faces: async () => ({}), fill: 'cell' }, /"fill"/],
  ])('throws for %s', (_case, given, message) => {
    const extension = started().api.connect(fakePlugin('ext'));
    expect(() => extension.dice.registerLook!(given as never)).toThrow(message);
    expect(customLooks()).toHaveLength(0);
  });

  it('refuses an id the extension already registered; another extension may use the same id', () => {
    const api = started().api;
    const one = api.connect(fakePlugin('one'));
    const two = api.connect(fakePlugin('two'));
    one.dice.registerLook!(spec());
    expect(() => one.dice.registerLook!(spec({ name: 'Again' }))).toThrow(/already registered a look "fire"/);
    two.dice.registerLook!(spec());
    expect(customLooks().map((look) => look.id)).toEqual(['one:fire', 'two:fire']);
  });

  it("the extension unloading removes its looks, and Atlas unloading removes every look", () => {
    const api = started();
    const plugin = fakePlugin('ext');
    api.api.connect(plugin).dice.registerLook!(spec());
    api.api.connect(fakePlugin('other')).dice.registerLook!(spec());
    plugin.unload();
    expect(customLooks().map((look) => look.id)).toEqual(['other:fire']);
    api.dispose();
    expect(customLooks()).toHaveLength(0);
  });
});
