// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { TokenStatblockLinkService } from '../../../../src/app/services/TokenStatblockLinkService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { frontmatterOfText, statblockSourceFromText } from '../../../../src/app/statblocks/notes/statblockSource';
import { createStatblock, startStatblockCreation } from '../../../../src/app/statblocks/editor/create/createFlow';
import { promptStatblockName } from '../../../../src/app/statblocks/editor/create/CreationPrompt';
import { chooseTemplate } from '../../../../src/app/statblocks/editor/create/TemplateChoiceModal';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

// The link service is tested on its own; its imports reach the canvas renderer.
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/create/CreationPrompt', () => ({ promptStatblockName: vi.fn() }));
vi.mock('../../../../src/app/statblocks/editor/create/TemplateChoiceModal', () => ({ chooseTemplate: vi.fn() }));

const MARSH: CollectionSettings = {
  conditions: [],
  statblockRoles: [
    { id: 'monster', name: 'Monster', templateId: 'builtin:generic-creature' },
    { id: 'beast', name: 'Beast', templateId: 'gone-aaaaaa' },
    { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' },
  ],
  statblockRoleFolders: { monster: 'Bestiary' },
};

let harness: NoteHarness;
let link: ReturnType<typeof vi.fn>;

/** Atlas' settings as these tests need them: the switch. */
function settings({ editor = true } = {}): void {
  vi.spyOn(SettingsService, 'forApp').mockReturnValue({
    getSetting: () => undefined,
    isExperimentalOn: () => editor,
    onChange: () => () => undefined,
  } as unknown as SettingsService);
}

beforeEach(() => {
  harness = noteHarness({});
  settings();
  link = vi.fn(async () => true);
  vi.mocked(TokenStatblockLinkService.getInstance).mockReturnValue({ linkTokenToStatblock: link } as unknown as TokenStatblockLinkService);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'default',
    getCollectionSettings: (id: string) => (id === 'marsh' ? MARSH : { conditions: [] }),
    getCollections: async () => [{ id: 'default', name: 'Default' }, { id: 'marsh', name: 'Marsh campaign' }],
  } as unknown as AssetService);
});

afterEach(() => {
  TemplateLibrary.release(harness.app as unknown as App);
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
  vi.mocked(promptStatblockName).mockReset();
  vi.mocked(chooseTemplate).mockReset();
});

const app = (): App => harness.app as unknown as App;

describe('creating a statblock for a token', () => {
  it('writes exactly the marker, the template, the name and the art, in the role\'s folder', async () => {
    const onLinked = vi.fn();
    const path = await createStatblock(app(), {
      collectionId: 'marsh', roleId: 'monster', name: 'Marsh Warden', tokenImagePath: 'art/warden.webp', from: 'map', onLinked,
    });

    expect(path).toBe('Bestiary/Marsh Warden.md');
    const text = harness.files.get('Bestiary/Marsh Warden.md')!;
    expect(frontmatterOfText(text)).toEqual({
      statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', image: 'art/warden.webp',
    });
    expect(text.endsWith('---\n')).toBe(true);
    expect(text).not.toContain('atlas-statblock');
    expect(statblockSourceFromText(text)).toEqual({ kind: 'atlas', templateId: 'builtin:generic-creature' });
  });

  it('links the token, then opens the note for the entry point\'s collection, focus on the first empty value', async () => {
    const onLinked = vi.fn();
    await createStatblock(app(), {
      collectionId: 'marsh', roleId: 'monster', name: 'Marsh Warden', tokenImagePath: 'art/warden.webp', from: 'map', onLinked,
    });

    expect(link).toHaveBeenCalledWith('art/warden.webp', 'Bestiary/Marsh Warden.md');
    expect(onLinked).toHaveBeenCalledWith('Bestiary/Marsh Warden.md');
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: 'Bestiary/Marsh Warden.md', collectionId: 'marsh', from: 'map', focusFirstEmpty: true });
  });

  it('starts a role whose template is missing from the generic one', async () => {
    await createStatblock(app(), { collectionId: 'marsh', roleId: 'beast', name: 'Wolf', from: 'asset-manager' });

    const text = harness.files.get('Wolf.md')!;
    expect(text).not.toContain('atlas-statblock');
    expect(frontmatterOfText(text)).toEqual({ statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Wolf' });
    expect(link).not.toHaveBeenCalled();
  });

  it('uses the default collection where the entry point has none', async () => {
    await createStatblock(app(), { collectionId: null, roleId: 'npc', name: 'Mayor', from: 'map' });

    expect(frontmatterOfText(harness.files.get('Mayor.md')!)?.['atlas-template']).toBe('builtin:generic-npc');
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), expect.objectContaining({ collectionId: 'default' }));
  });

  it('makes nothing while the switch is off', async () => {
    settings({ editor: false });
    expect(await createStatblock(app(), { collectionId: 'marsh', roleId: 'monster', name: 'Warden', from: 'map' })).toBeNull();
    expect(harness.files.size).toBe(0);
    expect(openStatblockEditor).not.toHaveBeenCalled();
  });

  it('says so and opens nothing when the note cannot be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    harness.app.vault.create = vi.fn(async () => { throw new Error('disk full'); });
    expect(await createStatblock(app(), { collectionId: 'marsh', roleId: 'monster', name: 'Warden', from: 'map' })).toBeNull();
    expect(openStatblockEditor).not.toHaveBeenCalled();
  });
});

describe('creating a statblock from a command or the file menu (spec §12.2)', () => {
  it('offers the collection\'s kinds of statblock, then its templates, and creates in the role\'s folder', async () => {
    vi.mocked(chooseTemplate).mockImplementation(async (_app, offers) => offers.find((offer) => offer.roleId === 'monster') ?? null);
    vi.mocked(promptStatblockName).mockResolvedValue('Bog Hag');
    const path = await startStatblockCreation(app(), { collectionId: 'marsh', from: 'command' });

    const offers = vi.mocked(chooseTemplate).mock.calls[0]![1];
    expect(offers.slice(0, 3).map((offer) => [offer.label, offer.detail])).toEqual([['Monster', 'Creature'], ['Beast', 'Creature'], ['NPC', 'NPC']]);
    expect(offers.some((offer) => offer.label === '5E (2014 rules)' && offer.detail === 'Built in')).toBe(true);
    expect(path).toBe('Bestiary/Bog Hag.md');
    expect(frontmatterOfText(harness.files.get(path!)!)).toEqual({ statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Bog Hag' });
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: path, collectionId: 'marsh', from: 'command', focusFirstEmpty: true });
  });

  it('offers the template being edited first, and creates in the folder picked', async () => {
    vi.mocked(chooseTemplate).mockImplementation(async (_app, offers) => offers[0] ?? null);
    vi.mocked(promptStatblockName).mockResolvedValue('Mayor');
    const path = await startStatblockCreation(app(), { collectionId: null, folder: 'World/Swamp', templateId: 'builtin:5e-2014-monster', from: 'command' });

    expect(vi.mocked(chooseTemplate).mock.calls[0]![1][0]).toEqual({ templateId: 'builtin:5e-2014-monster', label: '5E (2014 rules)', detail: 'The template you are editing' });
    expect(path).toBe('World/Swamp/Mayor.md');
    expect(frontmatterOfText(harness.files.get(path!)!)?.['atlas-template']).toBe('builtin:5e-2014-monster');
  });

  it('makes nothing when the user backs out of the template or the name', async () => {
    vi.mocked(chooseTemplate).mockResolvedValue(null);
    expect(await startStatblockCreation(app(), { collectionId: 'marsh', from: 'command' })).toBeNull();
    vi.mocked(chooseTemplate).mockImplementation(async (_app, offers) => offers[0] ?? null);
    vi.mocked(promptStatblockName).mockResolvedValue(null);
    expect(await startStatblockCreation(app(), { collectionId: 'marsh', from: 'command' })).toBeNull();
    expect(harness.files.size).toBe(0);
  });
});
