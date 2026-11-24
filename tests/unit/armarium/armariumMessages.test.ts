import { describe, expect, it, vi } from 'vitest';
import { acceptFrameMessage, clearTagsMessage, installedMessage, postToFrame, readFrameMessage, statusMessage, toggleTagMessage } from '../../../src/app/armarium/armariumMessages';
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

  it('reads what the page asks to share: a collection without `what`, an item kind with it, nothing it does not know', () => {
    expect(installedMessage([], ['share', 'share-items'])).toMatchObject({ features: ['share', 'share-items'] });
    for (const what of ['collection', 'statblock-template', 'system-preset', 'dice-set'] as const) {
      expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what })).toEqual({ type: 'atlas-armarium:share', what });
    }
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what: 'map' })).toBeNull();
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what: 3 })).toBeNull();
  });

  it('reads music to share with the listing it continues, and drops a listing that is no uid', () => {
    expect(installedMessage([], ['music', 'share-music'])).toMatchObject({ features: ['music', 'share-music'] });
    const listing = '0123456789abcdef0123456789abcdef';
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what: 'music-track' })).toEqual({ type: 'atlas-armarium:share', what: 'music-track' });
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what: 'music-album', listing })).toEqual({ type: 'atlas-armarium:share', what: 'music-album', listing });
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what: 'music-album', listing: '../../x' })).toEqual({ type: 'atlas-armarium:share', what: 'music-album' });
    expect(readFrameMessage({ type: 'atlas-armarium:share', format: 1, what: 'music-album', listing: 42 })).toEqual({ type: 'atlas-armarium:share', what: 'music-album' });
  });
});

describe('the store\'s tags from the Armarium page', () => {
  const tags = {
    type: 'atlas-armarium:tags',
    format: 1,
    groups: [
      { id: 'genre', label: 'Genre', tags: [{ id: 'dark-fantasy', label: 'Dark fantasy', count: 3 }] },
      { id: 'place', label: 'Place', tags: [{ id: 'forest', label: ' Forest ', count: 0 }, { id: 'dungeon', label: 'Dungeon', count: 1 }] },
    ],
    picked: ['forest'],
  };
  const withGroup = (group: unknown): unknown => ({ ...tags, groups: [group] });

  it('reads groups, counts and picked tags, trimming labels and ignoring fields beyond the contract', () => {
    expect(readFrameMessage({ ...tags, extra: true })).toEqual({
      type: 'atlas-armarium:tags',
      groups: [
        { id: 'genre', label: 'Genre', tags: [{ id: 'dark-fantasy', label: 'Dark fantasy', count: 3 }] },
        { id: 'place', label: 'Place', tags: [{ id: 'forest', label: 'Forest', count: 0 }, { id: 'dungeon', label: 'Dungeon', count: 1 }] },
      ],
      picked: ['forest'],
    });
  });

  it.each([
    ['no groups', { ...tags, groups: undefined }],
    ['no picked list', { ...tags, picked: undefined }],
    ['a picked tag that is not offered', { ...tags, picked: ['castle'] }],
    ['a tag offered twice', withGroup({ id: 'g', label: 'G', tags: [{ id: 'a', label: 'A', count: 1 }, { id: 'a', label: 'A', count: 1 }] })],
    ['an id that is no kebab-case id', withGroup({ id: 'g', label: 'G', tags: [{ id: 'Dark Fantasy', label: 'A', count: 1 }] })],
    ['an empty label', withGroup({ id: 'g', label: 'G', tags: [{ id: 'a', label: '  ', count: 1 }] })],
    ['a label too long', withGroup({ id: 'g', label: 'G', tags: [{ id: 'a', label: 'x'.repeat(81), count: 1 }] })],
    ['a fractional count', withGroup({ id: 'g', label: 'G', tags: [{ id: 'a', label: 'A', count: 1.5 }] })],
    ['a negative count', withGroup({ id: 'g', label: 'G', tags: [{ id: 'a', label: 'A', count: -1 }] })],
    ['a group without tags', withGroup({ id: 'g', label: 'G' })],
    ['too many groups', { ...tags, groups: Array.from({ length: 33 }, (_, i) => ({ id: `g${i}`, label: 'G', tags: [] })), picked: [] }],
    ['too many tags', withGroup({ id: 'g', label: 'G', tags: Array.from({ length: 257 }, (_, i) => ({ id: `t${i}`, label: 'T', count: 0 })) })],
  ])('ignores %s', (_case, data) => {
    expect(readFrameMessage(data)).toBeNull();
  });

  it('answers presses in format 1', () => {
    expect(toggleTagMessage('forest')).toEqual({ type: 'atlas-armarium:toggle-tag', format: 1, tag: 'forest' });
    expect(clearTagsMessage()).toEqual({ type: 'atlas-armarium:clear-tags', format: 1 });
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
