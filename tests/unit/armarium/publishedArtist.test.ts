import { describe, expect, it, vi } from 'vitest';
import { artistOfContents, contentsUrlOf, publicIndexUrl, readPublishedArtist } from '../../../src/app/armarium/upload/publishedArtist';

const UID = '13e4e245f9eb3d10a21a3add69fc0d5c';
const FILES = 'https://atlasvttusercontent.com';
const contentsAt = (version: number): string => `${FILES}/contents/${UID}/${version}/85a90b97f746.json`;
const index = {
  format: 1,
  listings: [
    { uid: 'b'.repeat(32), versions: [{ version: 1, contentsUrl: `${FILES}/contents/other.json` }] },
    { uid: UID, format: 'music-album', versions: [{ version: 1, contentsUrl: contentsAt(1) }, { version: 2, contentsUrl: contentsAt(2) }] },
  ],
};
const contents = { format: 1, version: 2, item: { format: 'music-album', artist: 'Vindsvept', durationMs: 1, tracks: [] } };

describe('the artist a music listing published', () => {
  it('lies in the public index beside the cover, else on the files domain', () => {
    expect(publicIndexUrl(`${FILES}/media/${UID}/1/1136bb1423cf-full.webp`)).toBe(`${FILES}/index/v1.json`);
    expect(publicIndexUrl(null)).toBe(`${FILES}/index/v1.json`);
    expect(publicIndexUrl('https://elsewhere.example/cover.webp')).toBe(`${FILES}/index/v1.json`);
  });

  it('is found through the contents of the version asked for, else of the newest version the index lists', () => {
    expect(contentsUrlOf(index, UID, 1)).toBe(contentsAt(1));
    expect(contentsUrlOf(index, UID, 3)).toBe(contentsAt(2));
    expect(contentsUrlOf(index, UID, null)).toBe(contentsAt(2));
    expect(contentsUrlOf(index, 'c'.repeat(32), 1)).toBeNull();
    expect(contentsUrlOf({ listings: [{ uid: UID, versions: [{ version: 1, contentsUrl: 'https://elsewhere.example/c.json' }] }] }, UID, 1)).toBeNull();
    expect(contentsUrlOf(null, UID, 1)).toBeNull();
    expect(contentsUrlOf({ listings: 'none' }, UID, 1)).toBeNull();
  });

  it('is read only where it is one line Atlas would carry, without hidden format characters', () => {
    expect(artistOfContents(contents)).toBe('Vindsvept');
    expect(artistOfContents({ item: { artist: ' Vind‮svept ' } })).toBe('Vindsvept');
    expect(artistOfContents({ item: { artist: null } })).toBeNull();
    expect(artistOfContents({ item: { artist: 'a\nb' } })).toBeNull();
    expect(artistOfContents({ item: { artist: 'x'.repeat(121) } })).toBeNull();
    expect(artistOfContents({ item: { artist: 7 } })).toBeNull();
    expect(artistOfContents('artist')).toBeNull();
  });

  it('reads the index, then the contents, and answers null wherever either fails', async () => {
    const listing = { uid: UID, newestVersion: 2, coverUrl: null };
    const fetched: string[] = [];
    const fetchJson = (url: string): Promise<unknown> => {
      fetched.push(url);
      return Promise.resolve(url.endsWith('/index/v1.json') ? index : contents);
    };
    await expect(readPublishedArtist(listing, fetchJson)).resolves.toBe('Vindsvept');
    expect(fetched).toEqual([`${FILES}/index/v1.json`, contentsAt(2)]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(readPublishedArtist(listing, () => Promise.reject(new Error('offline')))).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await expect(readPublishedArtist({ ...listing, uid: 'c'.repeat(32) }, fetchJson)).resolves.toBeNull();
  });
});
