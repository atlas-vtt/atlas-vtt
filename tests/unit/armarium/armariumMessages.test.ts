import { describe, expect, it, vi } from 'vitest';
import { acceptFrameMessage, installedMessage, postToFrame, readFrameMessage, statusMessage } from '../../../src/app/armarium/armariumMessages';
import { requestFromParams } from '../../../src/app/armarium/armariumRequest';

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const frame = { postMessage: vi.fn() } as unknown as Window;
const install = { type: 'atlas-armarium:install', format: 1, uid: UID, version: 5 };

describe('messages from the Armarium page', () => {
  it('reads install and hello in format 1, ignoring fields beyond the contract', () => {
    expect(readFrameMessage({ ...install, extra: { nested: true } })).toEqual({ type: 'atlas-armarium:install', uid: UID, version: 5 });
    expect(readFrameMessage({ type: 'atlas-armarium:hello', format: 1, page: '/armarium' })).toEqual({ type: 'atlas-armarium:hello' });
  });

  it.each([
    ['another format', { ...install, format: 2 }],
    ['no format', { type: 'atlas-armarium:install', uid: UID, version: 5 }],
    ['another type', { ...install, type: 'atlas-armarium:uninstall' }],
    ['a uid that is no string', { ...install, uid: 42 }],
    ['an empty uid', { ...install, uid: '' }],
    ['a uid with a path in it', { ...install, uid: '../../etc' }],
    ['a uid too long', { ...install, uid: 'a'.repeat(129) }],
    ['a version of 0', { ...install, version: 0 }],
    ['a negative version', { ...install, version: -1 }],
    ['a fractional version', { ...install, version: 1.5 }],
    ['a version as text', { ...install, version: '5' }],
    ['an unsafe version', { ...install, version: 2 ** 60 }],
    ['an array', [install]],
    ['text', JSON.stringify(install)],
    ['null', null],
  ])('ignores %s', (_case, data) => {
    expect(readFrameMessage(data)).toBeNull();
  });

  it('accepts a message only from the Armarium origin and the tab\'s own frame', () => {
    const event = { origin: 'https://atlas-vtt.dev', source: frame, data: install };
    expect(acceptFrameMessage(event, frame)).toEqual({ type: 'atlas-armarium:install', uid: UID, version: 5 });
    expect(acceptFrameMessage({ ...event, origin: 'https://evil.example' }, frame)).toBeNull();
    expect(acceptFrameMessage({ ...event, origin: 'http://atlas-vtt.dev' }, frame)).toBeNull();
    expect(acceptFrameMessage({ ...event, origin: 'https://play.atlas-vtt.dev' }, frame)).toBeNull();
    expect(acceptFrameMessage({ ...event, source: {} }, frame)).toBeNull();
    expect(acceptFrameMessage({ ...event, source: null }, frame)).toBeNull();
    expect(acceptFrameMessage(event, null)).toBeNull();
  });

  it('answers in format 1, only to the Armarium origin', () => {
    const post = vi.fn();
    postToFrame({ postMessage: post } as unknown as Window, statusMessage({ uid: UID, version: 5 }, 'reviewing'));
    expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:status', format: 1, uid: UID, version: 5, state: 'reviewing' }, 'https://atlas-vtt.dev');
    expect(installedMessage([{ uid: UID, version: 5 }])).toEqual({ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 5 }], features: [] });
    expect(installedMessage([], ['share'])).toMatchObject({ features: ['share'] });
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, extra: 1 })).toEqual({ type: 'atlas-armarium:share' });
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 2 })).toBeNull();
    expect(() => postToFrame(null, installedMessage([]))).not.toThrow();
  });
});

describe('the install link', () => {
  it('reads uid and version', () => {
    expect(requestFromParams({ action: 'atlas-vtt-install', uid: UID, version: '5' })).toEqual({ uid: UID, version: 5 });
  });

  it.each([
    [{ uid: UID }],
    [{ version: '5' }],
    [{ uid: UID, version: '0' }],
    [{ uid: UID, version: '05' }],
    [{ uid: UID, version: '5.0' }],
    [{ uid: UID, version: '1e3' }],
    [{ uid: UID, version: 'true' }],
    [{ uid: 'a b', version: '5' }],
  ])('refuses %o', (params) => {
    expect(requestFromParams(params)).toBeNull();
  });
});
