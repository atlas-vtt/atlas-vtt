// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { AssetService, type CollectionMetadata } from '../../../../src/app/services/AssetService';
import { SystemPresetFiles } from '../../../../src/app/services/systemPresets/SystemPresetFiles';
import { SystemPresetService } from '../../../../src/app/services/SystemPresetService';
import { builtInTemplate } from '../../../../src/app/statblocks/library/builtInTemplates';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { copyTemplate, createTemplateFile, deleteTemplate } from '../../../../src/app/statblocks/library/templateActions';
import { templateUsage } from '../../../../src/app/statblocks/library/templateUsage';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { memoryPresets } from '../../../mocks/memoryPresets';
import { closeSessionVault, sessionVault, type SessionVault } from './sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER } from './templateTexts';

const REPLACEMENT = 'builtin:generic-creature';
const note = (template: string): string => `---\nstatblock: true\natlas-template: ${template}\nname: Bog\n---\nBody.\n`;

let vault: SessionVault;
let settings: ReturnType<typeof memoryPresets>;
let collections: CollectionMetadata[];
let updateCollectionSettings: ReturnType<typeof vi.fn>;

function addNote(path: string, template: string): void {
  vault.files.set(path, note(template));
  vault.frontmatter[path] = { statblock: true, 'atlas-template': template, name: 'Bog' };
}

function collection(id: string, statblockRoles?: CollectionSettings['statblockRoles'], systemPresetId?: string): CollectionMetadata {
  const settings: CollectionSettings = { conditions: [], ...(statblockRoles && { statblockRoles }), ...(systemPresetId && { systemPresetId }) };
  return { id, uid: id, version: 1, name: id, tags: {}, settings, createdAt: 0, modifiedAt: 0 };
}

const read = (path: string): StatblockTemplate => JSON.parse(vault.files.get(path)!) as StatblockTemplate;

beforeEach(async () => {
  vault = sessionVault();
  settings = memoryPresets();
  vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(settings as unknown as SystemPresetFiles);
  const homebrew = new SystemPresetService(settings).create('Homebrew', {
    ...structuredClone(BUILT_IN_SYSTEM_PRESETS[1]!.rules),
    statblockRoles: [{ id: 'monster', name: 'Monster', templateId: MARSH_ID }],
  });
  collections = [
    collection('marsh', [{ id: 'creature', name: 'Creature', templateId: MARSH_ID }, { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }]),
    collection('homebrew', undefined, homebrew.id),
    collection('plain'),
  ];
  updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    loadedCollections: () => collections,
    getCollectionSettings: (id: string) => collections.find((entry) => entry.id === id)?.settings ?? { conditions: [] },
    updateCollectionSettings,
  } as unknown as AssetService);
  addNote('Bestiary/Bog.md', MARSH_ID);
  addNote('Bestiary/Fen.md', MARSH_ID);
  addNote('Bestiary/Goblin.md', REPLACEMENT);
  vault.files.set('Notes/Plain.md', 'Just a note.\n');
  await vault.settled();
});

afterEach(async () => {
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

describe('templateUsage', () => {
  it('finds the notes that name the template and the roles that start from it, own or from a system', () => {
    expect(templateUsage(vault.app, MARSH_ID)).toEqual({
      notes: ['Bestiary/Bog.md', 'Bestiary/Fen.md'],
      roles: [
        { collectionId: 'marsh', roleId: 'creature', roleName: 'Creature' },
        { collectionId: 'homebrew', roleId: 'monster', roleName: 'Monster' },
      ],
    });
    expect(vi.mocked(vault.app.vault.read)).not.toHaveBeenCalled();
    expect(vi.mocked(vault.app.vault.cachedRead).mock.calls.every(([file]) => !String((file as { path: string }).path).endsWith('.md'))).toBe(true);
  });
});

describe('createTemplateFile and copyTemplate', () => {
  it('creates a template in the library folder under a new id, at the next free name', async () => {
    const first = await createTemplateFile(vault.app, 'Marsh creature', MARSH_CREATURE);
    expect(first.path).toBe(`${TEMPLATE_FOLDER}/Marsh creature 2.atlastemplate`);
    expect(first.id).toMatch(/^marsh-creature-[a-z0-9]{6}$/);
    expect(read(first.path)).toEqual({ ...JSON.parse(vault.files.get(MARSH_PATH)!), id: first.id });
    expect(TemplateLibrary.forApp(vault.app).get(first.id)?.path).toBe(first.path);
    const odd = await createTemplateFile(vault.app, 'Bog: the [wet] one', MARSH_CREATURE);
    expect(odd.path).toBe(`${TEMPLATE_FOLDER}/Bog- the -wet- one.atlastemplate`);
  });

  it('copies a built-in with its revision and licence, and leaves the built-in as it is', async () => {
    const source = builtInTemplate('builtin:5e-2024-monster')!;
    const copy = await copyTemplate(vault.app, source.id);
    const template = read(copy.path);
    expect(copy.path).toBe(`${TEMPLATE_FOLDER}/${source.name} copy.atlastemplate`);
    expect(template.derivedFrom).toEqual({ templateId: source.id, revision: source.revision });
    expect(template.source).toEqual(source.template.source);
    expect(template.fields).toEqual(source.template.fields);
    expect(builtInTemplate(source.id)).toBe(source);
  });

  it('copies a vault template as it is saved, never an editor\'s unsaved draft, under the name given, and keeps the source file', async () => {
    const session = TemplateSession.open(vault.app, MARSH_ID)!;
    session.apply((template) => ({ ...template, description: 'Unsaved' }));
    const copy = await copyTemplate(vault.app, MARSH_ID, 'Fen creature');
    session.release();
    expect(read(copy.path)).toMatchObject({ id: copy.id, description: MARSH_CREATURE.description, derivedFrom: { templateId: MARSH_ID } });
    expect(read(copy.path).derivedFrom).not.toHaveProperty('revision');
    expect(vault.files.has(MARSH_PATH)).toBe(true);
    await expect(copyTemplate(vault.app, 'unknown-abc123')).rejects.toThrow();
  });
});

describe('deleteTemplate', () => {
  it('switches its notes and roles to the replacement, then trashes the file', async () => {
    await deleteTemplate(vault.app, MARSH_ID, REPLACEMENT);
    expect(vault.files.get('Bestiary/Bog.md')).toBe(note(REPLACEMENT));
    expect(vault.files.get('Bestiary/Fen.md')).toBe(note(REPLACEMENT));
    expect(vault.files.get('Notes/Plain.md')).toBe('Just a note.\n');
    expect(updateCollectionSettings).toHaveBeenCalledTimes(1);
    expect(updateCollectionSettings).toHaveBeenCalledWith('marsh', {
      statblockRoles: [{ id: 'creature', name: 'Creature', templateId: REPLACEMENT }, { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }],
    });
    const homebrew = new SystemPresetService(settings).list().find((preset) => preset.name === 'Homebrew');
    expect(homebrew?.rules.statblockRoles).toEqual([{ id: 'monster', name: 'Monster', templateId: REPLACEMENT }]);
    expect(vault.files.has(MARSH_PATH)).toBe(false);
    expect(vault.app.fileManager.trashFile).toHaveBeenCalledTimes(1);
  });

  it('writes no unsaved edits and, without a replacement, leaves notes and roles as they are', async () => {
    const session = TemplateSession.open(vault.app, MARSH_ID)!;
    session.apply((template) => ({ ...template, description: 'Last edit' }));
    const trash = vi.mocked(vault.app.fileManager.trashFile);
    const trashed: string[] = [];
    trash.mockImplementationOnce(async () => { trashed.push(vault.files.get(MARSH_PATH)!); vault.deleteExternally(MARSH_PATH); });
    await deleteTemplate(vault.app, MARSH_ID, null);
    session.release();
    expect(JSON.parse(trashed[0]!)).toMatchObject({ description: MARSH_CREATURE.description });
    expect(vault.files.get('Bestiary/Bog.md')).toBe(note(MARSH_ID));
    expect(updateCollectionSettings).not.toHaveBeenCalled();
  });

  it('never deletes a built-in', async () => {
    await expect(deleteTemplate(vault.app, REPLACEMENT, null)).rejects.toThrow('Built-in templates can\'t be deleted.');
  });
});
