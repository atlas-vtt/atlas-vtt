import { afterEach, describe, expect, it } from 'vitest';
import type { Asset, SceneAsset } from '../../src/app/services/AssetService';
import { bundleNoteKeys } from '../../src/app/extensions/bundleNoteKeys';
import { isNote, withoutJsonExtensions, withoutNoteKeys, withoutSceneExtensions } from '../../src/app/services/collectionBundle/bundleExtensionData';
import { mayRewrite, refersToFiles, rewriteContent, rewriteText, toBuffer } from '../../src/app/services/collectionBundle/bundleContent';
import type { BundleFile } from '../../src/app/services/collectionBundle/bundleFormat';
import { assetFingerprint } from '../../src/app/services/collectionBundle/fingerprints';
import { installedAsset, type ImportTargets } from '../../src/app/services/collectionBundle/importInputs';
import { transferredRecord } from '../../src/app/services/assetTransfer/transferRecords';
import { sceneAsset } from '../mocks/sceneAsset';

const extensions = { 'some-extension': { item: 'x', notes: ['Notes/Secret.md'] } };
const creator = { createdBy: 'some-extension', createdImages: ['Notes/Secret.md'] };
type Data = NonNullable<SceneAsset['data']>;

/** Both kinds of index-only scene data: what an extension keeps on it, and the extension that added it with its images. */
const withPrivateData: ReadonlyArray<readonly [string, (mapPath: string) => Data]> = [
  ['extension data', (mapPath) => ({ mapPath, extensions })],
  ['the extension that added it', (mapPath) => ({ mapPath, ...creator } as Data)],
  ['both', (mapPath) => ({ mapPath, extensions, ...creator } as Data)],
];

describe.each(withPrivateData)('scene data never travels in a bundle (%s)', (_name, data) => {
  it('is dropped from scene records and left alone on other assets', () => {
    expect((withoutSceneExtensions(sceneAsset({ data: data('m.atlasmap') })) as SceneAsset).data).toEqual({ mapPath: 'm.atlasmap' });
    const plain = sceneAsset({ data: { mapPath: 'm.atlasmap' } });
    expect(withoutSceneExtensions(plain)).toBe(plain);
    const token = { id: 't', type: 'token', name: 'x', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1 } as unknown as Asset;
    expect(withoutSceneExtensions(token)).toBe(token);
  });

  it('is dropped when a bundle is installed', () => {
    const targets = { collectionId: 'target', assetIds: new Map<string, string>(), rewrites: new Map<string, string>() } as unknown as ImportTargets;
    expect((installedAsset(sceneAsset({ data: data('m.atlasmap') }), targets) as SceneAsset).data).toEqual({ mapPath: 'm.atlasmap' });
  });

  it('is dropped from a scene record file in the bundle, with or without moved paths', () => {
    const file = { vaultPath: 'atlas-vtt/collections/c/scenes/s1.json', role: 'asset-file', sha256: 'x' } as unknown as BundleFile;
    const text = JSON.stringify({ name: 'Inn', ...data('m.atlasmap') }, null, 2);
    const out = JSON.parse(new TextDecoder().decode(rewriteContent(file, toBuffer(text), new Map()))) as Record<string, unknown>;
    expect(out).toEqual({ name: 'Inn', mapPath: 'm.atlasmap' });
    const moved = JSON.parse(new TextDecoder().decode(rewriteContent(file, toBuffer(text), new Map([['m.atlasmap', 'n.atlasmap']])))) as Record<string, unknown>;
    expect(moved).toEqual({ name: 'Inn', mapPath: 'n.atlasmap' });
    expect(withoutJsonExtensions({ type: 'scene', data: data('m') })).toEqual({ type: 'scene', data: { mapPath: 'm' } });
    expect(withoutJsonExtensions({ mapPath: 'm' })).toEqual({ mapPath: 'm' });
  });

  it('is not even read on export while the vault holds no extension data, so stock exports parse no record file', () => {
    const file = { vaultPath: 'atlas-vtt/collections/c/scenes/s1.json', role: 'asset-file', sha256: 'x' } as unknown as BundleFile;
    expect(mayRewrite(file, new Map(), false)).toBe(false);
    const bytes = toBuffer(JSON.stringify({ name: 'Inn', mapPath: 'm.atlasmap' }));
    expect(rewriteContent(file, bytes, new Map(), false)).toBe(bytes);
    // Moved paths still rewrite it, as before.
    expect(mayRewrite(file, new Map([['m.atlasmap', 'n.atlasmap']]), false)).toBe(true);
    expect(mayRewrite(file, new Map())).toBe(true);
  });

  it('does not make a scene that carries it look edited', async () => {
    expect(await assetFingerprint(sceneAsset({ data: data('m.atlasmap') }))).toBe(await assetFingerprint(sceneAsset({ data: { mapPath: 'm.atlasmap' } })));
  });

  it('stays with the original when a scene is copied, and with a moved scene', () => {
    const context = { targetCollectionId: 'other', newIds: new Map([['s1', 's2']]), plan: { rewrites: new Map(), recordPaths: new Map() }, now: 5 };
    const copy = transferredRecord(sceneAsset({ data: data('m.atlasmap') }), context as never) as SceneAsset;
    expect(copy.data).toEqual({ mapPath: 'm.atlasmap' });
    const moved = transferredRecord(sceneAsset({ data: data('m.atlasmap') }), { ...context, newIds: new Map() } as never) as SceneAsset;
    expect(moved.data).toEqual(data('m.atlasmap'));
  });
});

describe('note properties an extension keeps out of bundles', () => {
  const decode = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);
  const pack = (file: BundleFile, text: string, rewrites = new Map<string, string>()): string => decode(rewriteContent(file, toBuffer(text), rewrites));
  let stop: () => void = () => undefined;
  const register = (): void => { stop = bundleNoteKeys.add('test', ['ext-share']); };
  afterEach(() => stop());

  it('is applied to every note role and path, with or without moved paths, and never to other files', () => {
    register();
    const note = '---\next-share: [Ana]\ntitle: T\n---\nText';
    for (const role of ['linked-note', 'statblock-note', 'loot-item'] as const) {
      const file = { vaultPath: `Notes/${role}.md`, role } as BundleFile;
      expect(mayRewrite(file, new Map())).toBe(true);
      expect(pack(file, note)).toBe('---\ntitle: T\n---\nText');
    }
    const png = { vaultPath: 'Notes/a.png', role: 'note-attachment' } as BundleFile;
    const bytes = toBuffer(note);
    expect(rewriteContent(png, bytes, new Map())).toBe(bytes);
    const clean = toBuffer('---\ntitle: T\n---\n');
    expect(rewriteContent({ vaultPath: 'a.md', role: 'linked-note' } as BundleFile, clean, new Map())).toBe(clean);
  });

  it('is not even read when no extension registered a key', () => {
    expect(mayRewrite({ vaultPath: 'Notes/a.md', role: 'linked-note' } as BundleFile, new Map())).toBe(false);
    const note = toBuffer('---\next-share: [Ana]\n---\n');
    expect(rewriteContent({ vaultPath: 'Notes/a.md', role: 'linked-note' } as BundleFile, note, new Map())).toBe(note);
  });

  it("still relinks a statblock note's artwork, from the text without the property", () => {
    register();
    const file = { vaultPath: 'B/g.md', role: 'statblock-note', statblockImage: { key: 'image', path: 'B/g.png' } } as BundleFile;
    expect(pack(file, '---\next-share: public\nimage: B/g.png\n---\n', new Map([['B/g.png', 'C/g.png']]))).toBe('---\nimage: "C/g.png"\n---\n');
  });

  it("is not applied when a scene moves to another collection: the user's own notes keep their property", () => {
    register();
    const file = { vaultPath: 'B/g.md', role: 'statblock-note', statblockImage: { key: 'image', path: 'B/g.png' } } as BundleFile;
    const note = '---\next-share: public\nimage: B/g.png\n---\n';
    expect(rewriteText(file, note, new Map([['B/g.png', 'C/g.png']]))).toBe('---\next-share: public\nimage: "C/g.png"\n---\n');
    expect(refersToFiles({ vaultPath: 'Notes/a.md', role: 'linked-note' } as BundleFile)).toBe(false);
  });

  it('withoutNoteKeys leaves other files alone and isNote tells notes by extension', () => {
    const keys = new Set(['ext-share']);
    expect(withoutNoteKeys({ vaultPath: 'a.json' }, '---\next-share: x\n---\n', keys)).toBe('---\next-share: x\n---\n');
    expect(withoutNoteKeys({ vaultPath: 'A.MD' }, '---\next-share: x\n---\n', keys)).toBe('---\n---\n');
    expect(isNote({ vaultPath: 'x/y.md' })).toBe(true);
    expect(isNote({ vaultPath: 'x/y.png' })).toBe(false);
  });
});
