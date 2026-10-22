import { describe, expect, it } from 'vitest';
import { MAX_SHARED_PINS, parseGmMessage, parseLogEntry, parsePlayerMessage, TEXT_MIME_TYPE } from '../../../../src/app/online/protocol/index.ts';

const ALIAS = 'a'.repeat(24);
const ENTRY = 'e'.repeat(24);
const PLAYER = 'p'.repeat(20);
const HASH = 'c'.repeat(64);
const PIN = { id: ALIAS, x: 120, y: 80.5, icon: 'castle-tower', found: null };
const FOUND = { id: ENTRY, at: 1, who: PLAYER, name: 'Ana', kind: 'found', title: 'Cellar', body: 'Barrels of **old** wine.\n\n![[cask.png|200]]' };

describe('readable pins as players are sent them', () => {
  it('read as they were written, found or not', () => {
    const message = { t: 'pins', scene: 's', pins: [PIN, { ...PIN, id: 'b'.repeat(24), found: ENTRY }] };
    expect(parseGmMessage(message)).toEqual(message);
  });

  it('refuse a pin by another id than an alias, an icon that is no key, a found that is no entry, or too many', () => {
    for (const bad of [{ ...PIN, id: 'pin-1' }, { ...PIN, icon: '<svg>' }, { ...PIN, found: 'nobody' }, { ...PIN, x: Number.NaN }, 'Places/Keep.md']) {
      expect(parseGmMessage({ t: 'pins', scene: 's', pins: [bad] })).toBeNull();
    }
    expect(parseGmMessage({ t: 'pins', scene: 's', pins: Array.from({ length: MAX_SHARED_PINS + 1 }, () => PIN) })).toBeNull();
  });

  it('take a player opening a pin by its alias in a scene, and nothing else', () => {
    expect(parsePlayerMessage({ t: 'pin-found', scene: 's', pin: ALIAS })).toEqual({ t: 'pin-found', scene: 's', pin: ALIAS });
    expect(parsePlayerMessage({ t: 'pin-found', scene: 's', pin: 'Places/Keep.md' })).toBeNull();
    expect(parsePlayerMessage({ t: 'pin-found', pin: ALIAS })).toBeNull();
  });
});

describe('a found note in the log', () => {
  it('reads with its whole text and images by hash, and its reactions', () => {
    const entry = { ...FOUND, text: { hash: HASH, size: 9000, mime: TEXT_MIME_TYPE }, images: [{ target: 'cask.png', width: 200, height: null, image: { hash: HASH, size: 10, mime: 'image/png' } }], reactions: [{ emoji: '👍', by: ['gm'] }] };
    expect(parseLogEntry(entry)).toEqual(entry);
    expect(parseLogEntry(FOUND)).toEqual(FOUND);
  });

  it('is found by a player, never the GM, and refuses a title or text that cannot be shown', () => {
    expect(parseLogEntry({ ...FOUND, who: 'gm', name: 'GM' })).toBeNull();
    expect(parseLogEntry({ ...FOUND, title: '' })).toBeNull();
    expect(parseLogEntry({ ...FOUND, body: 'x'.repeat(3000) })).toBeNull();
    expect(parseLogEntry({ ...FOUND, text: { hash: HASH, size: 9, mime: 'image/png' } })).toBeNull();
  });
});
