// @vitest-environment jsdom
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { registerCommands, type CommandDependencies } from '../../../../src/app/plugin/registerCommands';
import { AssetService } from '../../../../src/app/services/AssetService';
import { openNewTemplate, openTemplateEditor } from '../../../../src/app/statblocks/editor/openTemplateEditor';
import { assignRoleTemplate, createFromPick, openPick, saveStatblockAsTemplate } from '../../../../src/app/statblocks/editor/gallery/galleryActions';
import { statblockTemplate } from '../../../../src/app/statblocks/editor/gallery/statblockNotes';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import { templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { openTemplateGallery } from '../../../../src/app/statblocks/editor/gallery/openTemplateGallery';
import { registerHostedDialogRelease } from '../../../../src/app/statblocks/editor/hostedDialog';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER } from '../library/templateTexts';

vi.mock('../../../../src/app/statblocks/editor/openTemplateEditor', () => ({
  openTemplateEditor: vi.fn(async () => null),
  openNewTemplate: vi.fn(async () => null),
}));

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
let vault: SessionVault;
let settings: CollectionSettings;
let updateCollectionSettings: ReturnType<typeof vi.fn>;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vault = sessionVault();
  settings = { conditions: [], systemPresetId: dnd5e.id };
  updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollections: async () => [{ id: 'marsh', name: 'Marsh' }],
    loadedCollections: () => [],
    getDefaultCollectionId: () => 'marsh',
    getCollectionSettings: () => settings,
    updateCollectionSettings,
  } as unknown as AssetService);
  await vault.settled();
  vi.mocked(openTemplateEditor).mockClear();
  vi.mocked(openNewTemplate).mockClear();
});

afterEach(async () => {
  cleanup();
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

const fileCount = (): number => vault.files.size;

describe('after the gallery', () => {
  it('opens a copy of the card in the editor unsaved, writing nothing and asking nothing about other statblocks', async () => {
    const before = fileCount();
    const entry = TemplateLibrary.forApp(vault.app).get('builtin:generic-creature')!;
    await openPick(vault.app, { kind: 'template', entry }, 'marsh', null);
    expect(fileCount()).toBe(before);
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(openTemplateEditor).not.toHaveBeenCalled();
    expect(openNewTemplate).toHaveBeenCalledWith(vault.app, {
      template: { ...entry.template, derivedFrom: { templateId: entry.template.id, revision: GENERIC_CREATURE.revision } },
      name: 'Creature copy',
      body: '',
      collectionId: 'marsh',
      role: null,
    });
  });

  it('carries a copied template\'s note into the copy: unsaved, for its first save to write; written at once, beside it', async () => {
    vault.writeExternally(templateBodyPath(MARSH_PATH), '## Lair\n');
    const entry = TemplateLibrary.forApp(vault.app).get(MARSH_ID)!;
    await openPick(vault.app, { kind: 'template', entry }, null, null);
    expect(vi.mocked(openNewTemplate).mock.calls[0]![1]).toMatchObject({ name: 'Marsh creature copy', body: '## Lair\n' });
    const created = await createFromPick(vault.app, { kind: 'template', entry });
    expect(vault.files.get(templateBodyPath(created.path))).toBe('## Lair\n');
    expect(vault.files.get(templateBodyPath(MARSH_PATH))).toBe('## Lair\n');
  });

  it('gives the template to the role only once it is saved', async () => {
    await openPick(vault.app, { kind: 'blank' }, 'marsh', 'npc');
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(vi.mocked(openNewTemplate).mock.calls[0]![1]).toMatchObject({ name: 'New template', role: { collectionId: 'marsh', roleId: 'npc' } });
  });

  it('names a template after the first name no template goes by', async () => {
    vault.writeExternally(`${TEMPLATE_FOLDER}/New template.atlastemplate`, '{}');
    await openPick(vault.app, { kind: 'blank' }, null, null);
    expect(vi.mocked(openNewTemplate).mock.calls[0]![1]).toMatchObject({ name: 'New template 2', collectionId: null, role: null });
  });

  it('gives a role its template, storing the collection\'s own roles, and none where it ends at the system\'s template again', async () => {
    await assignRoleTemplate(vault.app, 'marsh', 'npc', 'creature-abc123');
    expect(updateCollectionSettings).toHaveBeenCalledWith('marsh', {
      statblockRoles: [
        { id: 'monster', name: 'Monster', templateId: 'builtin:5e-2024-monster' },
        { id: 'npc', name: 'NPC', templateId: 'creature-abc123' },
      ],
    });
    await assignRoleTemplate(vault.app, 'marsh', 'npc', 'builtin:5e-2024-monster');
    expect(updateCollectionSettings).toHaveBeenLastCalledWith('marsh', { statblockRoles: undefined });
  });
});

describe('Save as a template', () => {
  it('builds a template from the statblock\'s values and opens it unsaved, named after the statblock', async () => {
    const before = fileCount();
    await saveStatblockAsTemplate(vault.app, 'Bestiary/Bog Hag.md', { statblock: true, name: 'Bog Hag', hp: 30, speed: '30 ft.' }, 'marsh');
    expect(fileCount()).toBe(before);
    const [, options] = vi.mocked(openNewTemplate).mock.calls[0]!;
    const template = options.template as StatblockTemplate;
    expect(template.fields.map((field) => field.key)).toEqual(['name', 'hp', 'speed']);
    expect(options).toMatchObject({ name: 'Bog Hag', collectionId: 'marsh', select: template.layout.blocks[0]!.id });
  });

  it('takes the note\'s body, without its frontmatter, as the text its first save writes into the template\'s note', async () => {
    vault.writeExternally('Bestiary/Bog Hag.md', '---\nstatblock: true\nname: Bog Hag\n---\n## Lair\n\nA drowned mill.\n');
    await saveStatblockAsTemplate(vault.app, 'Bestiary/Bog Hag.md', { statblock: true, name: 'Bog Hag', hp: 30, speed: '30 ft.' }, 'marsh');
    const [, options] = vi.mocked(openNewTemplate).mock.calls[0]!;
    expect(options.body).toBe('## Lair\n\nA drowned mill.\n');
    expect(options.template).not.toHaveProperty('body');
  });

  it('gives no text where the note has only blank lines below its frontmatter', async () => {
    vault.writeExternally('Bestiary/Bog Hag.md', '---\nstatblock: true\nname: Bog Hag\n---\n\n');
    await saveStatblockAsTemplate(vault.app, 'Bestiary/Bog Hag.md', { statblock: true, name: 'Bog Hag', hp: 30, speed: '30 ft.' }, 'marsh');
    expect(vi.mocked(openNewTemplate).mock.calls[0]![1].body).toBe('');
  });

  it('takes the note\'s body from the gallery\'s "From a statblock" too: unsaved for its first save, written at once into the note beside the template', async () => {
    vault.writeExternally('Bestiary/Bog Hag.md', '---\nstatblock: true\nname: Bog Hag\nhp: 30\n---\nKeep away.\n');
    const template = statblockTemplate({ statblock: true, name: 'Bog Hag', hp: 30, speed: '30 ft.' })!;
    const pick = { kind: 'statblock' as const, path: 'Bestiary/Bog Hag.md', template };
    await openPick(vault.app, pick, 'marsh', null);
    expect(vi.mocked(openNewTemplate).mock.calls[0]![1].body).toBe('Keep away.\n');
    const created = await createFromPick(vault.app, pick);
    expect(JSON.parse(vault.files.get(created.path)!)).not.toHaveProperty('body');
    expect(vault.files.get(templateBodyPath(created.path))).toBe('Keep away.\n');
  });

  it('opens nothing for a statblock without values', async () => {
    await saveStatblockAsTemplate(vault.app, 'Bestiary/Empty.md', { statblock: true }, 'marsh');
    expect(openNewTemplate).not.toHaveBeenCalled();
  });
});

describe('New statblock template…', () => {
  type Command = { id: string; checkCallback?: (checking: boolean) => boolean | void };

  function commands(): Command[] {
    const added: Command[] = [];
    const addCommand = (command: Command): Command => { added.push(command); return command; };
    // Everything else a plugin offers (ribbon icons, events) does nothing here.
    const plugin = new Proxy({ app: vault.app, addCommand }, { get: (target, name) => (name in target ? target[name as keyof typeof target] : vi.fn()) });
    registerCommands(plugin as unknown as Plugin, {} as CommandDependencies);
    return added;
  }

  it('is offered only while the statblock editor is switched on', () => {
    const command = commands().find((entry) => entry.id === 'new-statblock-template')!;
    expect(command.checkCallback?.(true)).toBe(false);
    withStatblockEditor(vault.app);
    expect(command.checkCallback?.(true)).toBe(true);
  });

  it('opens the gallery for the default collection, with its system\'s templates', async () => {
    withStatblockEditor(vault.app);
    await act(async () => { await openTemplateGallery(vault.app); });
    expect(screen.getByRole('dialog', { name: 'New template' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['5E (2024 rules)']);
    expect(screen.getByRole('combobox', { name: 'Starts new statblocks for' }).textContent).toBe('Monster');
    act(() => { screen.getByRole('button', { name: 'Cancel' }).click(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull());
    expect(document.querySelector('.atlas-te-gallery-host')).toBeNull();
  });

  it('goes with its window when that closes, and with Atlas when it unloads', async () => {
    withStatblockEditor(vault.app);
    const unloads: Array<() => void> = [];
    const plugin = { app: vault.app, registerEvent: vi.fn(), register: (unload: () => void) => unloads.push(unload) };
    registerHostedDialogRelease(plugin as unknown as Plugin);
    const gallery = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'New template' });

    await act(async () => { await openTemplateGallery(vault.app); });
    act(() => vault.workspace.trigger('window-close', {}, { document: document.implementation.createHTMLDocument('Popout') }));
    expect(gallery()).toBeTruthy();
    act(() => vault.workspace.trigger('window-close', {}, window));
    expect(gallery()).toBeNull();
    expect(document.querySelector('.atlas-te-gallery-host')).toBeNull();

    await act(async () => { await openTemplateGallery(vault.app); });
    expect(gallery()).toBeTruthy();
    act(() => { for (const unload of unloads) unload(); });
    expect(gallery()).toBeNull();
    expect(document.querySelector('.atlas-te-gallery-host')).toBeNull();
  });

  it('does nothing while the statblock editor is switched off', async () => {
    await openTemplateGallery(vault.app);
    expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull();
  });
});
