import { describe, expect, it, vi } from 'vitest';
import { ThumbnailCache } from '../../../src/app/packages/components/dungeon-generator/thumbnailCache';

const bitmap = (): ImageBitmap => ({ close: vi.fn() }) as unknown as ImageBitmap;

describe('the style gallery’s thumbnails', () => {
  it('keeps the last two pictures and closes the bitmaps of older ones', () => {
    const cache = new ThumbnailCache(['night', 'slate', 'ice']);
    const first = bitmap();
    const second = bitmap();
    cache.of('a');
    expect(cache.put('a', 'night', first)).toBe(true);
    cache.of('b');
    expect(cache.put('b', 'night', second)).toBe(true);
    expect(cache.of('a').get('night')).toBe(first);
    cache.of('c');
    // 'a' was looked at last, so 'b' goes
    expect(second.close).toHaveBeenCalled();
    expect(first.close).not.toHaveBeenCalled();
    expect(cache.of('a').get('night')).toBe(first);
  });

  it('closes a thumbnail that arrives for a picture it no longer keeps, or twice', () => {
    const cache = new ThumbnailCache(['night', 'slate', 'ice']);
    const late = bitmap();
    expect(cache.put('gone', 'slate', late)).toBe(false);
    expect(late.close).toHaveBeenCalled();
    cache.of('a');
    cache.put('a', 'slate', bitmap());
    const again = bitmap();
    expect(cache.put('a', 'slate', again)).toBe(false);
    expect(again.close).toHaveBeenCalled();
  });

  it('closes every bitmap when cleared', () => {
    const cache = new ThumbnailCache(['night', 'slate', 'ice']);
    const kept = bitmap();
    cache.of('a');
    cache.put('a', 'ice', kept);
    cache.clear();
    expect(kept.close).toHaveBeenCalled();
    expect(cache.of('a').size).toBe(0);
  });

  it('shows a picture once every card is back, and keeps the last such picture until then', () => {
    const cache = new ThumbnailCache(['night', 'ice']);
    const old = bitmap();
    cache.of('a');
    cache.put('a', 'night', old);
    expect(cache.shown('a').size).toBe(0);
    cache.put('a', 'ice', bitmap());
    expect(cache.shown('a').get('night')).toBe(old);

    cache.put('b', 'night', bitmap());
    cache.of('b');
    cache.put('b', 'night', bitmap());
    // 'b' is not whole yet: the cards keep 'a', which outlives two newer pictures
    expect(cache.shown('b').get('night')).toBe(old);
    cache.of('c');
    expect(old.close).not.toHaveBeenCalled();
    expect(cache.shown('c').get('night')).toBe(old);

    // A card that cannot be drawn does not hold its picture back
    cache.put('c', 'night', bitmap());
    expect(cache.fail('c', 'ice')).toBe(true);
    expect(cache.shown('c').get('night')).not.toBe(old);
    cache.of('d');
    expect(old.close).toHaveBeenCalled();
  });
});
