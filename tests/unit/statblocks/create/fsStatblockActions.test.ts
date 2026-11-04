// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu, TFile, type App } from 'obsidian';
import {
  adoptionChoices, mayHoldStatblockFence, offerFenceCopy, offerFsAdoption, type MenuPlace,
} from '../../../../src/app/statblocks/editor/create/fsStatblockActions';
import { copyFenceIntoStatblock, fenceValues } from '../../../../src/app/statblocks/editor/statblock-pane/fenceCopy';
import { saveStatblockAsTemplate } from '../../../../src/app/statblocks/editor/gallery/galleryActions';
import { showImportOutcome } from '../../../../src/app/statblocks/editor/fs-import/layoutImportFlow';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { frontmatterOfText } from '../../../../src/app/statblocks/notes/statblockSource';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FOLDER } from '../../../../src/app/statblocks/library/templatePaths';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { LAYOUTS } from '../fs-import/fsImportKit';

const fs = vi.hoisted(() => ({ on: true }));
vi.mock('../../../../src/app/services/FantasyStatblocksService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/FantasyStatblocksService')>();
  const layouts = (): typeof LAYOUTS | null => (fs.on ? LAYOUTS : null);
  return {
    ...actual,
    isFantasyStatblocksAvailable: () => fs.on,
    allLayouts: layouts,
    defaultLayout: () => layouts()?.[0] ?? null,
    findLayout: (_app: unknown, key: string) => layouts()?.find((layout) => layout.id === key || layout.name === key) ?? null,
  };
});
const roles = vi.hoisted(() => ({ list: [{ id: 'monster', name: 'Monster', templateId: 'builtin:generic-creature' }] }));
vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [], statblockRoles: roles.list }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/statblock-pane/fenceCopy', () => ({
  copyFenceIntoStatblock: vi.fn(async () => null),
  fenceValues: vi.fn(async () => ({ name: 'Fen hag', values: {}, layout: null })),
}));
vi.mock('../../../../src/app/statblocks/editor/gallery/galleryActions', () => ({ saveStatblockAsTemplate: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/fs-import/layoutImportFlow', () => ({ showImportOutcome: vi.fn() }));

const GOBLIN = 'Bestiary/Goblin.md';
const FENCE = 'Bestiary/Fen hag.md';
const CODE = 'Notes/Script.md';
const INLINE = 'Bestiary/Bog.md';
const PLACE: MenuPlace = { doc: document, x: 10, y: 20 };

let app: App;
let write: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const vault = createInMemoryApp({
    files: {
      [GOBLIN]: '---\nstatblock: true\nname: Goblin\nlayout: Marsh layout\nhp: 7\n---\n',
      [FENCE]: 'She waits.\n\n```statblock\nname: Fen hag\n```\n',
      [CODE]: '```js\nconsole.log(1);\n```\n',
      [INLINE]: '---\nstatblock: inline\n---\n',
    },
  });
  app = vault.app;
  // Obsidian's cache knows a note's code blocks, not their language.
  app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const text = vault.files.get(file.path) ?? '';
    return { frontmatter: frontmatterOfText(text) ?? undefined, sections: text.includes('```') ? [{ type: 'code' }] : [] };
  }) as unknown as App['metadataCache']['getFileCache'];
  write = vi.fn(async () => ({ applied: [{}], conflicts: [], problem: null }));
  vi.spyOn(NoteFieldWriter, 'forApp').mockReturnValue({ write } as unknown as NoteFieldWriter);
  Menu.shown = null;
});

afterEach(() => {
  TemplateLibrary.release(app);
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
  vi.mocked(copyFenceIntoStatblock).mockClear();
  vi.mocked(fenceValues).mockClear();
  vi.mocked(saveStatblockAsTemplate).mockClear();
  vi.mocked(showImportOutcome).mockClear();
  fs.on = true;
  roles.list = [{ id: 'monster', name: 'Monster', templateId: 'builtin:generic-creature' }];
});

const titles = (): string[] => Menu.shown?.items.map((item) => item.title) ?? [];
const choose = async (title: string): Promise<void> => {
  const item = Menu.shown?.items.find((candidate) => candidate.title === title);
  if (!item?.handler) throw new Error(`No menu item ${title}`);
  item.handler(new MouseEvent('click'));
  await vi.waitFor(() => expect(write).toHaveBeenCalled());
};

describe('Edit with an Atlas template… (§6.4)', () => {
  it('imports the note\'s own layout, writes atlas-template alone, opens the note and reports the import', async () => {
    await offerFsAdoption(app, new TFile(GOBLIN), PLACE);
    expect(titles()).toEqual(['Marsh layout (Imports its layout)', 'Monster (Creature)']);
    expect(Menu.shown?.position).toEqual({ x: 10, y: 20 });

    await choose('Marsh layout (Imports its layout)');
    const imported = TemplateLibrary.forApp(app).list().find((entry) => entry.template.importedFrom?.layoutName === 'Marsh layout')!;
    expect(imported.path).toBe(`${TEMPLATE_FOLDER}/Marsh layout.atlastemplate`);
    expect(write).toHaveBeenCalledWith(GOBLIN, [{ op: 'set', path: ['atlas-template'], base: undefined, next: imported.template.id }]);
    await vi.waitFor(() => expect(openStatblockEditor).toHaveBeenCalledWith(app, { notePath: GOBLIN, collectionId: 'campaign', from: 'command' }));
    expect(showImportOutcome).toHaveBeenCalled();
  });

  it('offers the template imported before, and a role\'s template', async () => {
    await offerFsAdoption(app, new TFile(GOBLIN), PLACE);
    await choose('Marsh layout (Imports its layout)');
    write.mockClear();

    const record = frontmatterOfText('---\nstatblock: true\nname: Goblin\nlayout: Marsh layout\n---\n')!;
    const choices = adoptionChoices(app, GOBLIN, record, 'campaign', document);
    expect(choices.map((choice) => [choice.title, choice.hint])).toEqual([['Marsh layout', 'From its layout'], ['Monster', 'Creature']]);
    await choices[1]!.run();
    expect(write).toHaveBeenCalledWith(GOBLIN, [{ op: 'set', path: ['atlas-template'], base: undefined, next: 'builtin:generic-creature' }]);
  });

  it('says why and opens nothing when the note could not take the template', async () => {
    write.mockResolvedValue({ applied: [], conflicts: [], problem: 'the YAML is broken.' });
    const [role] = adoptionChoices(app, GOBLIN, { statblock: true }, 'campaign', document).slice(-1);
    await role!.run();
    expect(openStatblockEditor).not.toHaveBeenCalled();
  });

  it('offers the roles, and a template of the statblock\'s own shape, without the plugin', async () => {
    fs.on = false;
    const choices = adoptionChoices(app, GOBLIN, { statblock: true, name: 'Goblin' }, 'campaign', document);
    expect(choices.map((choice) => choice.title)).toEqual(['Monster', 'New template from this statblock']);
    await choices[1]!.run();
    expect(saveStatblockAsTemplate).toHaveBeenCalledWith(app, GOBLIN, { statblock: true, name: 'Goblin' }, 'campaign');
  });
});

describe('Copy into a new statblock (§6.4)', () => {
  it('is offered on notes that may hold a fence, never on statblocks the frontmatter marks', () => {
    expect(mayHoldStatblockFence(app, new TFile(FENCE))).toBe(true);
    expect(mayHoldStatblockFence(app, new TFile(INLINE))).toBe(true);
    expect(mayHoldStatblockFence(app, new TFile(CODE))).toBe(true);
    expect(mayHoldStatblockFence(app, new TFile(GOBLIN))).toBe(false);
  });

  it('copies the fence with the collection\'s only role at once, without the plugin', async () => {
    fs.on = false;
    await offerFenceCopy(app, new TFile(FENCE), PLACE);
    expect(Menu.shown).toBeNull();
    await vi.waitFor(() => expect(copyFenceIntoStatblock).toHaveBeenCalledWith(app, FENCE, 'campaign', 'monster'));
  });

  it('offers the template of the fence\'s layout first, which shows what the fence showed', async () => {
    vi.mocked(fenceValues).mockResolvedValueOnce({ name: 'Fen hag', values: {}, layout: 'Marsh layout' });
    await offerFenceCopy(app, new TFile(FENCE), PLACE);
    expect(titles()).toEqual(['Marsh layout (Imports its layout)', 'Monster (Creature)']);
    Menu.shown!.items[0]!.handler!(new MouseEvent('click'));
    await vi.waitFor(() => expect(showImportOutcome).toHaveBeenCalled());
    const imported = TemplateLibrary.forApp(app).list().find((entry) => entry.template.importedFrom?.layoutName === 'Marsh layout')!;
    expect(copyFenceIntoStatblock).toHaveBeenCalledWith(app, FENCE, 'campaign', 'monster', imported.template.id);
  });

  it('offers the plugin\'s default layout for a fence that names none', async () => {
    await offerFenceCopy(app, new TFile(FENCE), PLACE);
    expect(titles()).toEqual(['Plain layout (Imports its layout)', 'Monster (Creature)']);
  });

  it('lets the user choose among several roles', async () => {
    fs.on = false;
    roles.list = [...roles.list, { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }];
    await offerFenceCopy(app, new TFile(FENCE), PLACE);
    expect(titles()).toEqual(['Monster (Creature)', 'NPC']);
    Menu.shown!.items[1]!.handler!(new MouseEvent('click'));
    await vi.waitFor(() => expect(copyFenceIntoStatblock).toHaveBeenCalledWith(app, FENCE, 'campaign', 'npc'));
  });

  it('copies nothing from a note whose code block is no statblock', async () => {
    vi.mocked(fenceValues).mockResolvedValueOnce(null);
    await offerFenceCopy(app, new TFile(CODE), PLACE);
    expect(Menu.shown).toBeNull();
    expect(copyFenceIntoStatblock).not.toHaveBeenCalled();
  });
});
