import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import type { BundleFile } from '../../../../src/app/services/collectionBundle/bundleFormat';
import { planImportPaths, templatePlacer } from '../../../../src/app/services/collectionBundle/pathRemap';
import { templateFingerprint } from '../../../../src/app/services/collectionBundle/fingerprints';
import { cleanTemplate, packTemplateFile, readBundleTemplates, vaultTemplates, withTemplateFiles } from '../../../../src/app/statblocks/bundles/bundleTemplates';
import { findCode } from '../../../../src/app/statblocks/model/fsCodeKeys';
import { MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../../../mocks/inMemoryVault';

const MARSH = 'marsh-creature-k7m2qa';
const LIBRARY = 'atlas-vtt/statblock-templates';
const MARSH_PATH = `${LIBRARY}/Marsh creature.atlastemplate`;

/** The Marsh creature with code where Fantasy Statblocks keeps it: a script block, and a diceCallback hidden in a block's fsExtras. */
function withCode(): string {
  const json = JSON.parse(MARSH_CREATURE_JSON) as { layout: { blocks: Array<Record<string, unknown>> } };
  json.layout.blocks.push(
    { id: 'js000001', type: 'script', summary: 'Rolls', fs: { type: 'javascript', code: 'return el;' } },
    { id: 'st000001', type: 'stat', field: 'hp', look: 'run-in', fsExtras: { diceCallback: 'return [];', keep: 'yes' } },
  );
  return JSON.stringify(json, null, 2);
}

function vaultWith(files: Record<string, string>): InMemoryApp {
  const vault = createInMemoryApp({ files });
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
  return vault;
}

const note = (template: string): string => `---\nstatblock: true\natlas-template: ${template}\n---\nA creature.`;

describe('template files in a bundle', () => {
  it('travel without script blocks and code-bearing keys, a diceCallback in fsExtras included', async () => {
    const packed = await cleanTemplate(MARSH_PATH, withCode());
    expect(packed).toMatchObject({ id: MARSH, name: 'Marsh creature', path: MARSH_PATH, entry: { builtIn: false, status: 'ok', name: 'Marsh creature' } });
    const json = JSON.parse(packed!.text) as { layout: { blocks: Array<Record<string, unknown>> } };
    expect(findCode(json)).toEqual([]);
    expect(json.layout.blocks.some((block) => block.type === 'script')).toBe(false);
    expect(json.layout.blocks.find((block) => block.id === 'st000001')).toEqual({ id: 'st000001', type: 'stat', field: 'hp', look: 'run-in', fsExtras: { keep: 'yes' } });
  });

  it('keep their exact text when they hold no code, and count a copy under another id as the same template', async () => {
    const packed = await cleanTemplate(MARSH_PATH, MARSH_CREATURE_JSON);
    expect(packed?.text).toBe(MARSH_CREATURE_JSON);
    const copy = { ...(JSON.parse(MARSH_CREATURE_JSON) as Record<string, unknown>), id: 'marsh-creature-c0py01' };
    expect(await templateFingerprint(copy)).toBe(packed?.fingerprint);
    expect((await cleanTemplate(MARSH_PATH, withCode()))?.fingerprint).not.toBe(packed?.fingerprint);
  });

  it('are refused when they are no template, or claim a built-in\'s id', async () => {
    expect(await cleanTemplate(MARSH_PATH, 'not json')).toBeNull();
    expect(await cleanTemplate(MARSH_PATH, '{"format":"something else"}')).toBeNull();
    expect(await cleanTemplate(MARSH_PATH, MARSH_CREATURE_JSON.replace(MARSH, 'builtin:generic-creature'))).toBeNull();
  });

  it('record the publisher\'s file as installed and the packed one as source', async () => {
    const result = await packTemplateFile(MARSH_PATH, new TextEncoder().encode(withCode()).buffer as ArrayBuffer);
    expect(result?.installed).toEqual({
      localId: MARSH, target: MARSH_PATH,
      source: (await cleanTemplate(MARSH_PATH, withCode()))?.fingerprint,
      installed: await templateFingerprint(JSON.parse(withCode()) as Record<string, unknown>),
    });
  });

  it('are read from a bundle with code dropped; the first file of an id holds it', async () => {
    const files: BundleFile[] = [
      { vaultPath: MARSH_PATH, role: 'statblock-template' },
      { vaultPath: 'Elsewhere/Marsh.atlastemplate', role: 'statblock-template' },
      { vaultPath: 'Broken.atlastemplate', role: 'statblock-template' },
      { vaultPath: 'Bestiary/Hag.md', role: 'statblock-note' },
    ];
    const texts: Record<string, string> = { [MARSH_PATH]: withCode(), 'Elsewhere/Marsh.atlastemplate': MARSH_CREATURE_JSON, 'Broken.atlastemplate': '{' };
    const templates = await readBundleTemplates(files, async (path) => texts[path] ?? null);
    expect(templates.map((template) => template.path)).toEqual([MARSH_PATH]);
    expect(findCode(JSON.parse(templates[0]!.text))).toEqual([]);
  });
});

describe('collecting a collection\'s templates', () => {
  it('packs the templates its roles and its notes name, never built-ins, and ties note templates to their notes', async () => {
    const { app } = vaultWith({
      [MARSH_PATH]: MARSH_CREATURE_JSON,
      [`${LIBRARY}/Bog hag.atlastemplate`]: MARSH_CREATURE_JSON.replace(MARSH, 'bog-hag-b0g001'),
      [`${LIBRARY}/Unused.atlastemplate`]: MARSH_CREATURE_JSON.replace(MARSH, 'unused-aaaaaa'),
      'Bestiary/Hag.md': note('bog-hag-b0g001'),
      'Bestiary/Imp.md': note(MARSH),
      'Bestiary/Ogre.md': note('builtin:generic-creature'),
      'Lore/Fen.md': note('bog-hag-b0g001'),
    });
    const files: BundleFile[] = [
      { vaultPath: 'Bestiary/Hag.md', role: 'statblock-note', owners: ['t1'] },
      { vaultPath: 'Bestiary/Imp.md', role: 'statblock-note', owners: ['t2'] },
      { vaultPath: 'Bestiary/Ogre.md', role: 'statblock-note', owners: ['t3'] },
      { vaultPath: 'Lore/Fen.md', role: 'linked-note' },
    ];
    const collected = await withTemplateFiles(app, files, [MARSH, 'builtin:generic-npc', 'gone-aaaaaa']);
    expect(collected.slice(files.length)).toEqual([
      { vaultPath: MARSH_PATH, role: 'statblock-template' },
      { vaultPath: `${LIBRARY}/Bog hag.atlastemplate`, role: 'statblock-template', linkedFrom: ['Bestiary/Hag.md', 'Lore/Fen.md'] },
    ]);
  });

  it('reads the vault\'s templates by id, the lowest path holding a duplicated one', async () => {
    const { app } = vaultWith({ [MARSH_PATH]: MARSH_CREATURE_JSON, 'A/Marsh copy.atlastemplate': MARSH_CREATURE_JSON, 'Notes/x.md': 'x' });
    const templates = await vaultTemplates(app);
    expect([...templates.values()]).toEqual([{ id: MARSH, path: 'A/Marsh copy.atlastemplate', fingerprint: (await cleanTemplate(MARSH_PATH, MARSH_CREATURE_JSON))?.fingerprint }]);
  });
});

describe('where templates land', () => {
  it('in the library folder, under their name, else the collection\'s in brackets, then a number', () => {
    const taken = new Set([`${LIBRARY}/marsh creature.atlastemplate`, `${LIBRARY}/Marsh creature (Fen).atlastemplate`]);
    const place = templatePlacer('Fen', (path) => [...taken].some((entry) => entry.toLowerCase() === path.toLowerCase()));
    expect(place('Marsh creature')).toBe(`${LIBRARY}/Marsh creature (Fen) 2.atlastemplate`);
    expect(place('Marsh creature')).toBe(`${LIBRARY}/Marsh creature (Fen) 3.atlastemplate`);
    expect(place('Bog: hag')).toBe(`${LIBRARY}/Bog- hag.atlastemplate`);
    expect(place('Bog: hag')).toBe(`${LIBRARY}/Bog- hag (Fen).atlastemplate`);
  });

  it('never by path: the path plan leaves them out, so none goes to the collection\'s statblocks folder', () => {
    const plan = planImportPaths([
      { vaultPath: MARSH_PATH, role: 'statblock-template' },
      { vaultPath: 'Bestiary/Hag.md', role: 'statblock-note' },
    ], { sourceCollectionId: 'Fen', targetCollectionId: 'Fen', existsInVault: () => false, hasSameContent: () => false, recordTargets: null });
    expect([...plan]).toEqual([['Bestiary/Hag.md', 'atlas-vtt/collections/Fen/statblocks/Hag.md']]);
  });
});
