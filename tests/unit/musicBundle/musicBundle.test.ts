// JSZip needs Node's ArrayBuffer realm; jsdom's differs.
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readAtlasCopy } from '../../../src/app/sound/codec/atlasOpus';
import { BUNDLE_MANIFEST } from '../../../src/app/services/collectionBundle/bundleFormat';
import { isItemManifest, isMusicManifest, itemManifestProblem } from '../../../src/app/services/itemBundle/itemBundleFormat';
import { isMusicText, musicBundleFileName, musicManifestProblem, safeFileName, shownText, trackFileName, trackNumber } from '../../../src/app/services/musicBundle/musicBundleFormat';
import { readMusicBundle } from '../../../src/app/services/musicBundle/musicBundleReader';
import { packMusicBundle } from '../../../src/app/services/musicBundle/musicPacking';
import { trackSidecarName } from '../../../src/app/services/musicBundle/musicProvenance';
import { copyOf, deliveredMusic, rebuiltAsTheStoreDoes } from '../../helpers/musicBundles';

const UID = '0123456789abcdef0123456789abcdef';
const HASH = 'a'.repeat(64);

const manifest = (item: Record<string, unknown> = {}, files?: Record<string, unknown>[]): Record<string, unknown> => {
  const tracks = (item.tracks as { path: string }[] | undefined) ?? [{ path: 'music/01 Dawn.opus', title: 'Dawn' }, { path: 'music/02 Dusk.opus', title: 'Dusk' }];
  return {
    format: 11,
    exportedAt: 1,
    item: { kind: 'music-album', uid: UID, id: UID, name: 'Old Roads', version: 1, tracks, ...item },
    files: files ?? tracks.map((track) => ({ vaultPath: track.path, role: 'music-track', sha256: HASH })),
  };
};

describe('a music manifest', () => {
  it('is an item manifest told apart by its kind, and an older reader takes it as newer', () => {
    expect(isMusicManifest(manifest())).toBe(true);
    expect(isItemManifest(manifest())).toBe(true);
    expect(isMusicManifest({ format: 10, item: { kind: 'dice-set' } })).toBe(false);
    expect(musicManifestProblem(manifest())).toBeNull();
    expect(musicManifestProblem({ ...manifest(), format: 12 })).toMatch(/newer version/);
    expect(itemManifestProblem(manifest())).toMatch(/damaged/i);
  });

  it('accepts a single of one track with an artist and a cover, and notes', () => {
    const tracks = [{ path: 'music/Dawn.opus', title: 'Dawn' }];
    expect(musicManifestProblem(manifest({ kind: 'music-track', name: 'Dawn', artist: 'Mara', notes: 'Remastered', tracks }, [
      { vaultPath: 'music/Dawn.opus', role: 'music-track', sha256: HASH },
      { vaultPath: 'cover.webp', role: 'cover', sha256: HASH },
    ]))).toBeNull();
  });

  it('refuses track counts outside its kind, tracks and files that do not match, and an id other than its uid', () => {
    const one = [{ path: 'music/Dawn.opus', title: 'Dawn' }];
    const damaged: Record<string, unknown>[] = [
      manifest({ tracks: one }),
      manifest({ kind: 'music-track', name: 'Dawn' }),
      manifest({ tracks: Array.from({ length: 101 }, (_, index) => ({ path: `music/${index}.opus`, title: `T${index}` })) }),
      manifest({ id: 'another-id' }),
      manifest({}, [{ vaultPath: 'music/01 Dawn.opus', role: 'music-track', sha256: HASH }]),
      manifest({}, [{ vaultPath: 'music/01 Dawn.opus', role: 'music-track' }, { vaultPath: 'music/03 Night.opus', role: 'music-track' }]),
      manifest({ tracks: [{ path: 'music/A.opus', title: 'A' }, { path: 'music/a.opus', title: 'a' }] }),
      manifest({ tracks: [{ path: 'music/deep/A.opus', title: 'A' }, { path: 'music/B.opus', title: 'B' }] }),
      manifest({ tracks: [{ path: 'music/A.mp3', title: 'A' }, { path: 'music/B.opus', title: 'B' }] }),
      manifest({}, [...(manifest().files as Record<string, unknown>[]).map((file) => ({ ...file, linkedFrom: ['x'] }))]),
      manifest({}, [...(manifest().files as Record<string, unknown>[]), { vaultPath: 'atlas-vtt/dice-sets/a.json', role: 'dice-set' }]),
      manifest({}, [...(manifest().files as Record<string, unknown>[]), { vaultPath: 'art/cover.webp', role: 'cover' }]),
      manifest({ name: 'Two\nlines' }),
      manifest({ artist: 'x'.repeat(121) }),
      manifest({ tracks: [{ path: 'music/01 Dawn.opus', title: '' }, { path: 'music/02 Dusk.opus', title: 'Dusk' }] }),
      manifest({ artist: 'Mara\u2028Quill' }),
      manifest({ name: '🎵'.repeat(61) }),
    ];
    for (const value of damaged) expect(musicManifestProblem(value)).toMatch(/damaged/i);
  });

  it('counts its texts as the Armarium\'s rules do, in UTF-16 units, so nothing Atlas packs is refused there for its length', () => {
    expect(musicManifestProblem(manifest({ name: '🎵'.repeat(60), artist: 'x'.repeat(120) }))).toBeNull();
  });
});

describe('music file names', () => {
  it('numbers album tracks as wide as the last, names singles by their title and keeps what no disk holds out', () => {
    expect(trackNumber(0, 12)).toBe('01');
    expect(trackNumber(6, 100)).toBe('007');
    expect(trackFileName('music-album', 2, 12, 'Over: the / Hills?')).toBe('03 Over- the - Hills-.opus');
    expect(trackFileName('music-track', 0, 1, '  ...Dawn. ')).toBe('Dawn.opus');
    expect(safeFileName('CON', 'Track')).toBe('CON_');
    expect(safeFileName('   ', 'Track')).toBe('Track');
    expect(musicBundleFileName('Old Roads', 3, 'music-album')).toBe('Old Roads v3.atlas-album.zip');
    expect(musicBundleFileName('Dawn', 1, 'music-track')).toBe('Dawn v1.atlas-track.zip');
  });

  it('cuts a name to 200 bytes of UTF-8 between graphemes, so with its number, a numbered twin and its part it fits a disk\'s 255', () => {
    const bytes = (text: string): number => new TextEncoder().encode(text).length;
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const cases: [string, string][] = [['Ж'.repeat(120), 'Ж'.repeat(100)], ['音'.repeat(120), '音'.repeat(66)], [family.repeat(30), family.repeat(11)], ['e\u0301'.repeat(120), 'e\u0301'.repeat(66)]];
    for (const [title, kept] of cases) {
      expect(safeFileName(title, 'Track')).toBe(kept);
      const track = trackFileName('music-album', 98, 100, title);
      expect(bytes(`${track.slice(0, -'.opus'.length)} 12.opus.atlas-part`)).toBeLessThanOrEqual(255);
      expect(bytes(`${trackSidecarName(trackFileName('music-track', 0, 1, title))}.atlas-part`)).toBeLessThanOrEqual(255);
    }
  });

  it('gives a Windows device name a name of its own whatever follows a dot, and leaves other names alone', () => {
    expect(safeFileName('nul.x', 'Track')).toBe('nul_.x');
    expect(trackFileName('music-track', 0, 1, 'Com1.live')).toBe('Com1_.live.opus');
    expect(safeFileName('Console', 'Track')).toBe('Console');
    expect(safeFileName('Nullify.me', 'Track')).toBe('Nullify.me');
  });

  it('shows and names files without hidden format characters, keeping the joiners emoji are written with', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(shownText('Dawn\u202Eevil')).toBe('Dawnevil');
    expect(trackFileName('music-track', 0, 1, 'Da\u200Bwn\uFEFF')).toBe('Dawn.opus');
    expect(safeFileName(`${family} Song`, 'Track')).toBe(`${family} Song`);
    expect(isMusicText('\u200B\u2066')).toBe(false);
    expect(isMusicText('Dawn\u2029')).toBe(false);
    expect(isMusicText(`${family} Song`)).toBe(true);
  });
});

describe('packing music for the Armarium', () => {
  it('packs the tracks in order without Atlas\' facts, stored, and the manifest first', async () => {
    const packed = await packMusicBundle({ kind: 'music-album', uid: UID, version: 2, name: ' Old Roads ', artist: 'Mara', notes: 'Two new songs', tracks: [{ title: 'Dawn', copy: await copyOf('1') }, { title: 'Dusk', copy: await copyOf('2') }] });
    expect(packed.fileName).toBe('Old Roads v2.atlas-album.zip');
    expect(packed.manifest.item).toMatchObject({ kind: 'music-album', uid: UID, id: UID, name: 'Old Roads', version: 2, artist: 'Mara', notes: 'Two new songs', tracks: [{ path: 'music/01 Dawn.opus', title: 'Dawn' }, { path: 'music/02 Dusk.opus', title: 'Dusk' }] });
    const zip = await JSZip.loadAsync(await packed.blob.arrayBuffer());
    expect(Object.keys(zip.files)[0]).toBe(BUNDLE_MANIFEST);
    const track = new Blob([await zip.file('files/music/01 Dawn.opus')!.async('uint8array')]);
    // The source's hash never leaves the device: what goes up is what players get.
    expect(await readAtlasCopy(track)).toBeNull();
    expect(await track.text()).not.toContain('ATLAS_SOURCE');
  });

  it('cuts notes as the Armarium counts them, never between the halves of an emoji, and packs titles without hidden format characters', async () => {
    const packed = await packMusicBundle({ kind: 'music-track', uid: UID, version: 2, name: 'Da\u202Ewn', notes: `${'a'.repeat(1999)}🎵 and more`, tracks: [{ title: 'Dawn', copy: await copyOf('1') }] });
    expect(packed.manifest.item.notes).toBe('a'.repeat(1999));
    expect(packed.manifest.item.name).toBe('Dawn');
  });

  it('refuses a count of tracks its kind does not hold', async () => {
    await expect(packMusicBundle({ kind: 'music-track', uid: UID, version: 1, name: 'Dawn', tracks: [] })).rejects.toThrow();
  });
});

describe('reading music from the Armarium', () => {
  it('reads what Atlas packed once the store rebuilt it, every track an Atlas copy in playing order', async () => {
    const bundle = await readMusicBundle(await deliveredMusic({ kind: 'music-album', uid: UID, version: 1, name: 'Old Roads', titles: ['Dawn', 'Dusk', 'Night'] }));
    expect(bundle.tracks.map((track) => track.title)).toEqual(['Dawn', 'Dusk', 'Night']);
    expect(bundle.tracks.every((track) => track.facts.frames > 0)).toBe(true);
    expect(bundle.cover).toBeNull();
  });

  it('refuses a bundle whose tracks are no Atlas copies, as Atlas packed it before the store', async () => {
    const packed = await packMusicBundle({ kind: 'music-track', uid: UID, version: 1, name: 'Dawn', tracks: [{ title: 'Dawn', copy: await copyOf('1') }] });
    await expect(readMusicBundle(packed.blob)).rejects.toThrow(/Dawn is not a track Atlas plays as it comes/);
  });

  it('refuses a track whose bytes are not those its manifest names', async () => {
    const delivered = await deliveredMusic({ kind: 'music-track', uid: UID, version: 1, name: 'Dawn', titles: ['Dawn'] });
    const zip = await JSZip.loadAsync(await delivered.arrayBuffer());
    zip.file('files/music/Dawn.opus', new Uint8Array([1, 2, 3]));
    await expect(readMusicBundle(new Blob([await zip.generateAsync({ type: 'uint8array' })]))).rejects.toThrow();
  });

  it('keeps the uploaded cover', async () => {
    const tracks = [{ title: 'Dawn', copy: await copyOf('1') }];
    const cover = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ').buffer;
    const packed = await packMusicBundle({ kind: 'music-track', uid: UID, version: 1, name: 'Dawn', tracks, cover });
    expect(packed.manifest.files.map((file) => file.vaultPath)).toEqual(['music/Dawn.opus', 'cover.webp']);
    const bundle = await readMusicBundle(await rebuiltAsTheStoreDoes(packed.blob));
    expect(bundle.cover?.size).toBe(cover.byteLength);
  });
});
