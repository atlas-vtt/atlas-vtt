// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { StatblockTokenImportService } from '../../src/app/services/StatblockTokenImportService';
import { AssetService } from '../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// Workers and canvases do not exist in jsdom; the conversion itself is covered by the image pipeline's tests.
const bytes = (text: string): Blob => ({ arrayBuffer: async () => new TextEncoder().encode(text).buffer } as Blob);
const convert = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ convertTokenArt: convert }));

const note = 'Bestiary/Goblin.md';
const image = 'Artwork/goblin.webp';
function setup() {
  const state = createInMemoryApp({ files: { [note]: 'Original note', [image]: 'image-bytes' } });
  state.app.workspace = { ...state.app.workspace, trigger: vi.fn() };
  const frontmatter: Record<string, Record<string, unknown>> = { [note]: { statblock: true, name: 'Goblin', image } };
  state.app.vault.cachedRead = state.app.vault.read;
  state.app.vault.getMarkdownFiles = () => [...state.files.keys()].filter(p => p.endsWith('.md')).map(p => new TFile(p));
  state.app.vault.createBinary = vi.fn(async (p: string, bytes: ArrayBuffer) => {
    state.files.set(p, new TextDecoder().decode(bytes));
    return new TFile(p);
  });
  state.app.metadataCache.getFileCache = (file: TFile) => ({ frontmatter: frontmatter[file.path] });
  state.app.metadataCache.getFirstLinkpathDest = (p: string) => state.files.has(p) ? new TFile(p) : null;
  Object.assign(window, { FantasyStatblocks: {
    isResolved: () => true,
    getBestiaryCreatures: () => Object.entries(frontmatter).map(([path, values]) => ({ path, ...values })),
    hasCreature: () => false,
  } });
  return { ...state, frontmatter, assets: AssetService.getInstance(state.app) };
}
beforeEach(() => {
  convert.mockReset();
  convert.mockImplementation(async (file: File) => ({ image: bytes(`webp:${file.name}`), thumbnail: bytes('thumbnail'), preview: null }));
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

describe('statblock token import', () => {
  it('does not mistake source artwork for an existing Atlas token', async () => {
    const { app, assets } = setup();
    await assets.initialize();
    const service = TokenStatblockLinkService.getInstance(app);
    expect(await service.getTokensLinkedToStatblock(note)).toEqual([]);
  });

  it('reads a `token` property as the artwork where `image` names none', () => {
    const { app, frontmatter } = setup();
    const service = TokenStatblockLinkService.getInstance(app);
    expect(service.readStatblockImage(new TFile(note))).toBe(image);
    frontmatter[note] = { statblock: true, token: 'Artwork/token.webp', 'token-image': 'Artwork/old.webp' };
    expect(service.readStatblockImage(new TFile(note))).toBe('Artwork/token.webp');
    frontmatter[note] = { statblock: true, image, token: 'Artwork/token.webp' };
    expect(service.readStatblockImage(new TFile(note))).toBe(image);
  });

  it('clears a `token` property on unlink only when it names the unlinked token', async () => {
    const { app, files, frontmatter, assets } = setup();
    await assets.initialize();
    const service = TokenStatblockLinkService.getInstance(app);
    const unlinkedFrom = async (fields: Record<string, string>): Promise<string> => {
      const tokenImage = fields.image ?? fields.token!;
      frontmatter[note] = fields;
      files.set(note, `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\nBody`);
      await assets.addTokenAsset({ name: 'Goblin', imagePath: tokenImage, statblockPath: note, tags: [], collection: 'Default' });
      await service.unlinkToken(tokenImage);
      return files.get(note)!;
    };
    expect(await unlinkedFrom({ token: 'atlas-vtt/assets/a.webp' })).not.toContain('token');
    const kept = await unlinkedFrom({ image: 'atlas-vtt/assets/b.webp', token: image });
    expect(kept).toContain(`token: ${image}`);
    expect(kept).not.toContain('image:');
  });
});

// The importer exercises real asset persistence; only the Obsidian filesystem is simulated.

describe('bulk importing recognized statblock notes', () => {
  it('resolves YAML wikilinks, inline statblocks and remote/missing images without guessing from names', async () => {
    const { app, files, frontmatter, assets } = setup();
    frontmatter[note]!.image = [[image + '|portrait']];
    frontmatter[note]!.size = 'Large';
    files.set('Other/Goblin.md', 'ordinary note');
    files.set('Inline.md', '```statblock\nname: Orc\nimage: Artwork/goblin.webp\n```');
    files.set('Remote.md', 'remote');
    frontmatter['Remote.md'] = { statblock: true, name: 'Remote', image: 'https://example.com/orc.png' };
    files.set('Missing.md', 'missing');
    frontmatter['Missing.md'] = { statblock: true, name: 'Missing', image: 'missing.png' };
    const rows = await new StatblockTokenImportService(app, assets).scan();
    expect(rows.map(r => [r.path, r.status])).toEqual(expect.arrayContaining([
      [note, 'ready'], ['Inline.md', 'ready'], ['Remote.md', 'remote-image'], ['Missing.md', 'missing-image'],
    ]));
    expect(rows.find(r => r.path === 'Other/Goblin.md')).toBeUndefined();
    expect(rows.find(r => r.path === note)).toMatchObject({ imagePath: image, size: 1.5 });
    expect(rows.find(r => r.path === 'Inline.md')?.size).toBeUndefined();
  });

  it('finds the artwork in a `token` property, and prefers `image` where a statblock has both', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Artwork/token.webp', 'image-bytes');
    frontmatter[note] = { statblock: true, name: 'Goblin', token: [['Artwork/token.webp']] };
    files.set('Both.md', 'both');
    frontmatter['Both.md'] = { statblock: true, name: 'Both', image, token: 'Artwork/token.webp' };
    const rows = await new StatblockTokenImportService(app, assets).scan();
    expect(rows.find(r => r.path === note)).toMatchObject({ status: 'ready', imagePath: 'Artwork/token.webp' });
    expect(rows.find(r => r.path === 'Both.md')).toMatchObject({ status: 'ready', imagePath: image });
  });

  it('decodes the link encoding Fantasy Statblocks applies to bestiary images', async () => {
    const { files, frontmatter, app, assets } = setup();
    frontmatter[note]!.image = `<STATBLOCK-WIKI-LINK>${image}|portrait<STATBLOCK-WIKI-LINK>`;
    files.set('Artwork/big goblin.webp', 'image-bytes');
    files.set('Markdown.md', 'markdown');
    frontmatter['Markdown.md'] = { statblock: true, name: 'Big Goblin', image: '<STATBLOCK-MARKDOWN-LINK>Artwork/big%20goblin.webp|Big<STATBLOCK-MARKDOWN-LINK>' };
    const rows = await new StatblockTokenImportService(app, assets).scan();
    expect(rows.find(r => r.path === note)).toMatchObject({ status: 'ready', imagePath: image });
    expect(rows.find(r => r.path === 'Markdown.md')).toMatchObject({ status: 'ready', imagePath: 'Artwork/big goblin.webp' });
  });

  it('creates distinct owned images for equal names/artwork, preserves source notes and skips reruns', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Other/Goblin.md', 'Other original');
    frontmatter['Other/Goblin.md'] = { ...frontmatter[note] };
    const importer = new StatblockTokenImportService(app, assets);
    const result = await importer.import([note, 'Other/Goblin.md', note], 'Default');
    expect(result.items.map(i => i.status)).toEqual(['created', 'created']);
    const tokens = await assets.getTokenAssets();
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map(t => t.imagePath)).size).toBe(2);
    expect(tokens.every(t => t.imagePath.startsWith('atlas-vtt/assets/') && t.imagePath.endsWith('.webp'))).toBe(true);
    expect(tokens.map(t => files.get(t.imagePath))).toEqual(['webp:goblin.webp', 'webp:goblin.webp']);
    expect(tokens.every(t => t.thumbnailPath && files.get(t.thumbnailPath) === 'thumbnail')).toBe(true);
    expect(tokens.map(t => t.statblockPath)).toEqual([note, 'Other/Goblin.md']);
    expect(files.get(note)).toBe('Original note');
    expect(files.get(image)).toBe('image-bytes');
    await assets.updateTokenAsset(tokens[0]!.id, { name: 'Customized Goblin' });
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('skipped');
    expect((await assets.getTokenAssets())[0]?.name).toBe('Customized Goblin');
    await assets.deleteAsset(tokens[0]!.id);
    expect(files.get(image)).toBe('image-bytes');
  });

  it('revalidates deleted artwork, continues after individual failures and supports cancellation', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Next.md', 'Next');
    frontmatter['Next.md'] = { ...frontmatter[note], name: 'Next' };
    const importer = new StatblockTokenImportService(app, assets);
    await importer.scan();
    files.delete(image);
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('skipped');
    files.set(image, 'bytes');
    app.vault.createBinary.mockRejectedValueOnce(new Error('Disk full'));
    expect((await importer.import([note, 'Next.md'], 'Default')).items.map(i=>i.status)).toEqual(['failed', 'created']);
    const controller = new AbortController();
    const result = await importer.import([note, 'Next.md'], 'Default', { signal: controller.signal, onProgress: () => controller.abort() });
    expect(result.items).toHaveLength(1);
    expect(result.cancelled).toBe(true);
  });

  it('does not register a phantom token after a primary metadata write fails', async () => {
    const { app, files, assets } = setup();
    await assets.initialize();
    const write = app.vault.adapter.write;
    app.vault.adapter.write = vi.fn(async (path: string, data: string) => {
      if (path.endsWith('assets-metadata.json')) throw new Error('Disk full');
      return write(path, data);
    });
    const importer = new StatblockTokenImportService(app, assets);
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('failed');
    app.vault.adapter.write = write;
    expect(await assets.getTokenAssets()).toHaveLength(0);
    expect([...files.keys()].filter(p => p.startsWith('atlas-vtt/assets/'))).toHaveLength(0);
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('created');
  });

  it('recognizes a committed token if only the legacy metadata mirror write fails', async () => {
    const { app, files, assets } = setup();
    await assets.initialize();
    files.set('atlas-vtt/assets-metadata.json', files.get('atlas-vtt/.atlas-data/assets-metadata.json')!);
    const write = app.vault.adapter.write;
    app.vault.adapter.write = vi.fn(async (path: string, data: string) => {
      if (path === 'atlas-vtt/assets-metadata.json') throw new Error('Mirror unavailable');
      return write(path, data);
    });
    const importer = new StatblockTokenImportService(app, assets);
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('created');
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('skipped');
    expect(await assets.getTokenAssets()).toHaveLength(1);
  });

  it('stops and retains the copied image when a write cannot be verified', async () => {
    const { app, files, frontmatter, assets } = setup();
    files.set('Next.md', 'Next');
    frontmatter['Next.md'] = { ...frontmatter[note], name: 'Next' };
    await assets.initialize();
    const read = app.vault.adapter.read;
    let writeFailed = false;
    app.vault.adapter.write = vi.fn(async () => { writeFailed = true; throw new Error('Storage unavailable'); });
    app.vault.adapter.read = vi.fn(async (path: string) => {
      if (writeFailed) throw new Error('Storage unavailable');
      return read(path);
    });
    const result = await new StatblockTokenImportService(app, assets).import([note, 'Next.md'], 'Default');
    expect(result.uncertain).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe('failed');
    expect([...files.keys()].filter(p => p.startsWith('atlas-vtt/assets/') && !p.startsWith('atlas-vtt/assets/thumbnails/'))).toHaveLength(1);
    expect(files.get(image)).toBe('image-bytes');
  });

  it('reads the notes alone without Fantasy Statblocks, waits for a bestiary that loads, and serializes import sessions', async () => {
    const { app, assets } = setup();
    const importer = new StatblockTokenImportService(app, assets);
    const api = window.FantasyStatblocks;
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    expect((await importer.scan()).map((row) => [row.path, row.status])).toEqual([[note, 'ready']]);
    Object.assign(window, { FantasyStatblocks: { ...api, isResolved: () => false } });
    await expect(importer.scan()).rejects.toThrow('still loading');
    Object.assign(window, { FantasyStatblocks: api });
    const first = importer.import([note], 'Default');
    await expect(importer.import([note], 'Default')).rejects.toThrow('already running');
    expect((await first).items[0]?.status).toBe('created');
    expect((await importer.import([note], 'Default')).items[0]?.status).toBe('skipped');
  });

  it('lists native statblocks without Fantasy Statblocks, naming their template in the layout column', async () => {
    const { app, assets, files, frontmatter } = setup();
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    const warden = 'Bestiary/Warden.md';
    files.set(warden, 'Native note');
    frontmatter[warden] = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Warden', image };
    const rows = await new StatblockTokenImportService(app, assets).scan();
    expect(rows.map((row) => [row.path, row.layoutName, row.status])).toEqual([[note, 'Unspecified', 'ready'], [warden, 'Creature', 'ready']]);
    TemplateLibrary.release(app);
  });

  it('shares the safe import path with the single-note command', async () => {
    const { app, files, assets } = setup();
    const link = TokenStatblockLinkService.getInstance(app);
    const created = await link.createTokenFromStatblockImage(note);
    expect(created).toMatch(/^atlas-vtt\/assets\/.*\.webp$/);
    expect(await link.getTokensLinkedToStatblock(note)).toEqual([created]);
    expect(await link.createTokenFromStatblockImage(note)).toBeNull();
    expect(await assets.getTokenAssets()).toHaveLength(1);
    expect(files.get(note)).toBe('Original note');
  });

  it('discovers explicit layouts and persists separate ring choices', async () => {
    const { app, assets, files, frontmatter } = setup();
    frontmatter[note]!.layout = 'Basic 5e Layout';
    files.set('Ogre.md', 'Ogre');
    frontmatter['Ogre.md'] = { ...frontmatter[note], name: 'Ogre', layout: 'Daggerheart Adversary' };
    const importer = new StatblockTokenImportService(app, assets);
    expect((await importer.scan()).map(r => r.layoutName)).toEqual(['Basic 5e Layout', 'Daggerheart Adversary']);
    const result = await importer.import([note, 'Ogre.md'], 'Default', { ringByPath: { [note]: false, 'Ogre.md': true } });
    expect(result.items.map(i => i.asset?.showRing)).toEqual([false, true]);
    expect(convert.mock.calls.map(([, framed]) => framed)).toEqual([false, true]);
    expect((await assets.getTokenAssets()).map(t => t.showRing)).toEqual([false, true]);
  });

});
