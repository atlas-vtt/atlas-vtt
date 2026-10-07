import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleNoteKeys } from '../../src/app/extensions/bundleNoteKeys';
import { rewriteContent } from '../../src/app/services/collectionBundle/bundleContent';
import type { BundleFile } from '../../src/app/services/collectionBundle/bundleFormat';

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const decode = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);

describe('statblock notes', () => {
  const note: BundleFile = { vaultPath: 'B/g.md', role: 'statblock-note', statblockImage: { key: 'image', path: 'B/g.png' } };

  it('rewrites the artwork field it names, not an earlier line with the same value', () => {
    const raw = '---\ntoken-image: B/g.png\nimage: B/g.png\n---\nA goblin.';
    const rewritten = decode(rewriteContent(note, encode(raw), new Map([['B/g.png', "atlas-vtt/x/Gold$'s.png"]])));
    expect(rewritten).toBe('---\ntoken-image: B/g.png\nimage: "atlas-vtt/x/Gold$\'s.png"\n---\nA goblin.');
  });

  it('rewrites a `token` field without touching `token-image`', () => {
    const raw = '---\ntoken-image: B/g.png\ntoken: B/g.png\n---\n';
    const tokenNote: BundleFile = { ...note, statblockImage: { key: 'token', path: 'B/g.png' } };
    expect(decode(rewriteContent(tokenNote, encode(raw), new Map([['B/g.png', 'C/g.png']])))).toBe('---\ntoken-image: B/g.png\ntoken: "C/g.png"\n---\n');
  });

  it('leaves notes whose artwork did not move, or that have no such field, byte for byte', () => {
    const raw = encode('---\nimage: B/g.png\n---\n');
    expect(rewriteContent(note, raw, new Map([['other', 'x']]))).toBe(raw);
    const plain = encode('No frontmatter here.');
    expect(rewriteContent(note, plain, new Map([['B/g.png', 'x']]))).toBe(plain);
  });
});

describe('JSON files', () => {
  const scene: BundleFile = { vaultPath: 'atlas-vtt/s.json', role: 'asset-file' };

  it('keeps the file\'s indentation and trailing newline when paths move', () => {
    const raw = `${JSON.stringify({ mapPath: 'a/b.atlasmap', n: 1 }, null, 2)}\n`;
    expect(decode(rewriteContent(scene, encode(raw), new Map([['a/b.atlasmap', 'c/b.atlasmap']]))))
      .toBe(`${JSON.stringify({ mapPath: 'c/b.atlasmap', n: 1 }, null, 2)}\n`);
  });

  it('returns the original bytes when no path in it moves', () => {
    const raw = encode('{"mapPath":"a/b.atlasmap"}');
    expect(rewriteContent(scene, raw, new Map([['elsewhere', 'x']]))).toBe(raw);
  });
});

describe('loot bases', () => {
  const base: BundleFile = { vaultPath: 'Items/Items.base', role: 'loot-base' };
  const moves = new Map([
    ['Items/Items.base', 'atlas-vtt/collections/c/loot/Items/Items.base'],
    ['Items/Armor/Shield.md', 'atlas-vtt/collections/c/loot/Items/Armor/Shield.md'],
    ['Art/shield.png', 'atlas-vtt/collections/c/files/shield.png'],
    ['token-1', 'token-2'],
  ]);

  it('points the folders and files it asks for at their new place, also inside a quoted filter', () => {
    const raw = [
      '- file.inFolder("Items")',
      "- 'file.inFolder(\"Items/Armor/\")'",
      '- file.path == "Items/Armor/Shield.md"',
      '- file.folder.startsWith("Items/Armor")',
    ].join('\n');
    expect(decode(rewriteContent(base, encode(raw), moves))).toBe([
      '- file.inFolder("atlas-vtt/collections/c/loot/Items")',
      "- 'file.inFolder(\"atlas-vtt/collections/c/loot/Items/Armor/\")'",
      '- file.path == "atlas-vtt/collections/c/loot/Items/Armor/Shield.md"',
      '- file.folder.startsWith("atlas-vtt/collections/c/loot/Items/Armor")',
    ].join('\n'));
  });

  it('leaves tags, property values and folders whose files went elsewhere byte for byte', () => {
    const raw = encode('- file.hasTag("Items")\n- type == "Items"\n- file.inFolder("Art")\n- file.inFolder("Other")');
    expect(rewriteContent(base, raw, moves)).toBe(raw);
  });
});

describe('notes with a byte order mark', () => {
  const note: BundleFile = { vaultPath: 'B/n.md', role: 'linked-note' } as BundleFile;
  const bytes = (buffer: ArrayBuffer): number[] => [...new Uint8Array(buffer)];
  let stop: () => void = () => undefined;

  beforeAll(() => { stop = bundleNoteKeys.add('test', ['ext-share']); });
  afterAll(() => stop());

  it('keep the mark when a registered property is stripped, and read back the same text', () => {
    const out = rewriteContent(note, encode('\uFEFF---\r\next-share: public\r\ntitle: x\r\n---\r\nBody'), new Map());
    expect(bytes(out).slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes(out).slice(3, 6)).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(decode(out)).toBe('---\r\ntitle: x\r\n---\r\nBody');
  });

  it('are not given one when the note had none', () => {
    const out = rewriteContent(note, encode('---\next-share: public\n---\n'), new Map());
    expect(bytes(out).slice(0, 3)).toEqual([...new TextEncoder().encode('---')]);
  });

  it('stay byte for byte when there is nothing to strip', () => {
    const raw = encode('\uFEFF---\ntitle: x\n---\n');
    expect(rewriteContent(note, raw, new Map())).toBe(raw);
  });

  it('are not added to JSON, whose decoder drops them', () => {
    const json: BundleFile = { vaultPath: 'B/a.json', role: 'asset-file' } as BundleFile;
    const out = rewriteContent(json, encode('\uFEFF{"path":"B/g.png"}'), new Map([['B/g.png', 'C/g.png']]));
    expect(decode(out)).toContain('C/g.png');
    expect(bytes(out)[0]).toBe('{'.charCodeAt(0));
  });
});
