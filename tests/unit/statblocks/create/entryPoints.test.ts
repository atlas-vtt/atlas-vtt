import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder, type App, type Command, type Menu, type Plugin } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createStatblock, startStatblockCreation } from '../../../../src/app/statblocks/editor/create/createFlow';
import {
  createStatblockEntry,
  editInStatblockPane,
  newStatblockOption,
} from '../../../../src/app/statblocks/editor/create/entryPoints';
import { registerStatblockEditorCommands, registerStatblockFileMenu } from '../../../../src/app/statblocks/editor/create/statblockCommands';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: vi.fn(async () => null),
  startStatblockCreation: vi.fn(async () => null),
}));

const NATIVE = 'Bestiary/Marsh Warden.md';
const FANTASY = 'Bestiary/Goblin.md';
const PLAIN = 'Notes/Marsh.md';
const TOKEN = { imagePath: 'art/warden.webp', name: 'Marsh Warden' };

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

beforeEach(() => {
  harness = noteHarness({
    [NATIVE]: '---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Marsh Warden\n---\n',
    [FANTASY]: '---\nstatblock: true\nname: Goblin\n---\n',
    [PLAIN]: '---\ntags: marsh\n---\nThe marsh.\n',
  });
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'default',
    getCollectionSettings: () => ({ conditions: [] }),
  } as unknown as AssetService);
});

afterEach(() => {
  TemplateLibrary.release(app());
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
  vi.mocked(createStatblock).mockClear();
  vi.mocked(startStatblockCreation).mockClear();
});

describe('Create statblock for a token', () => {
  it('is absent while the switch is off', () => {
    expect(createStatblockEntry(app(), { collectionId: 'marsh', from: 'map', token: TOKEN })).toBeNull();
    expect(newStatblockOption(app(), { collectionId: 'marsh', from: 'map', token: TOKEN })).toBeUndefined();
  });

  it('offers the collection\'s roles and creates for the token with the one chosen', () => {
    withStatblockEditor(app());
    const onStart = vi.fn();
    const onLinked = vi.fn();
    const entry = createStatblockEntry(app(), { collectionId: 'marsh', from: 'map', token: TOKEN, onStart, onLinked });
    if (entry?.type !== 'submenu' || typeof entry.children === 'function') throw new Error('expected the role menu');
    expect(entry.children.map((child) => (child.type === 'item' ? child.label : ''))).toEqual(['Creature', 'NPC']);

    const npc = entry.children[1];
    if (npc?.type === 'item') void npc.onClick();
    expect(onStart).toHaveBeenCalled();
    expect(createStatblock).toHaveBeenCalledWith(app(), {
      collectionId: 'marsh', roleId: 'npc', name: 'Marsh Warden', tokenImagePath: 'art/warden.webp', from: 'map', onLinked,
    });
  });

  it('gives the link dialog the same roles', () => {
    withStatblockEditor(app());
    const option = newStatblockOption(app(), { collectionId: null, from: 'asset-manager', token: TOKEN });
    expect(option?.choices.map((choice) => choice.roleId)).toEqual(['creature', 'npc']);
    option?.onChoose('creature');
    expect(createStatblock).toHaveBeenCalledWith(app(), expect.objectContaining({ roleId: 'creature', collectionId: null, from: 'asset-manager' }));
  });
});

describe('Edit statblock (D9)', () => {
  it('opens a native statblock\'s note, with its statblock beside it, while the switch is on', () => {
    withStatblockEditor(app());
    expect(editInStatblockPane(app(), NATIVE, { collectionId: 'marsh', from: 'map' })).toBe(true);
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: NATIVE, collectionId: 'marsh', from: 'map' });
  });

  it('leaves a Fantasy Statblocks statblock to the note, as before (M6)', () => {
    withStatblockEditor(app());
    expect(editInStatblockPane(app(), FANTASY, { collectionId: 'marsh', from: 'map' })).toBe(false);
    expect(openStatblockEditor).not.toHaveBeenCalled();
  });

  it('leaves other notes, and everything while the switch is off, to the note', () => {
    expect(editInStatblockPane(app(), NATIVE, { collectionId: null, from: 'map' })).toBe(false);
    expect(editInStatblockPane(app(), FANTASY, { collectionId: null, from: 'map' })).toBe(false);
    withStatblockEditor(app());
    expect(editInStatblockPane(app(), PLAIN, { collectionId: null, from: 'map' })).toBe(false);
    expect(editInStatblockPane(app(), 'Bestiary/Missing.md', { collectionId: null, from: 'map' })).toBe(false);
    expect(openStatblockEditor).not.toHaveBeenCalled();
  });
});

function registered(): { commands: Command[]; fileMenu: (menu: Menu, file: unknown) => void } {
  const commands: Command[] = [];
  const plugin = {
    app: app(),
    addCommand: (command: Command) => commands.push(command),
    registerEvent: vi.fn(),
  } as unknown as Plugin;
  registerStatblockEditorCommands(plugin);
  registerStatblockFileMenu(plugin);
  const fileMenu = harness.workspace;
  return { commands, fileMenu: (menu, file) => fileMenu.trigger('file-menu', menu, file) };
}

/** An Obsidian menu that records the titles of its items and runs one on request. */
function recordingMenu(): { menu: Menu; titles: string[]; click: (title: string) => void } {
  const items: Array<{ title: string; onClick: () => void }> = [];
  const menu = {
    addItem: (build: (item: unknown) => void) => {
      const entry = { title: '', onClick: () => undefined as void };
      const item = {
        setTitle: (title: string) => { entry.title = title; return item; },
        setIcon: () => item,
        onClick: (callback: () => void) => { entry.onClick = callback; return item; },
      };
      build(item);
      items.push(entry);
      return menu;
    },
  } as unknown as Menu;
  return {
    menu,
    get titles() { return items.map((item) => item.title); },
    click: (title) => items.find((item) => item.title === title)?.onClick(),
  };
}

describe('commands and the file menu', () => {
  it('offers nothing while the switch is off', () => {
    const { commands, fileMenu } = registered();
    for (const command of commands) expect(command.checkCallback?.(true)).toBe(false);
    const recorder = recordingMenu();
    fileMenu(recorder.menu, new TFolder('Bestiary'));
    fileMenu(recorder.menu, new TFile(NATIVE));
    expect(recorder.titles).toEqual([]);
  });

  it('New statblock… asks for a role and a name, naming no collection', () => {
    withStatblockEditor(app());
    const { commands } = registered();
    const command = commands.find((candidate) => candidate.id === 'new-statblock')!;
    expect(command.name).toBe('New statblock…');
    expect(command.checkCallback?.(true)).toBe(true);
    command.checkCallback?.(false);
    expect(startStatblockCreation).toHaveBeenCalledWith(app(), { collectionId: null, folder: undefined, from: 'command' });
  });

  it('Edit statblock is there only on a native statblock, Edit with an Atlas template only on Fantasy Statblocks\'', () => {
    withStatblockEditor(app());
    const { commands } = registered();
    const command = commands.find((candidate) => candidate.id === 'edit-statblock')!;
    const adopt = commands.find((candidate) => candidate.id === 'edit-with-atlas-template')!;
    const active = vi.fn(() => new TFile(PLAIN));
    Object.assign(harness.app.workspace, { getActiveFile: active });
    expect(command.checkCallback?.(true)).toBe(false);
    expect(adopt.checkCallback?.(true)).toBe(false);
    active.mockReturnValue(new TFile(FANTASY));
    expect(command.checkCallback?.(true)).toBe(false);
    expect(adopt.checkCallback?.(true)).toBe(true);

    active.mockReturnValue(new TFile(NATIVE));
    expect(adopt.checkCallback?.(true)).toBe(false);
    expect(command.checkCallback?.(true)).toBe(true);
    command.checkCallback?.(false);
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: NATIVE, collectionId: null, from: 'command' });
  });

  it('adds New statblock here to folders, Edit statblock in Atlas to native statblocks and the adoption to Fantasy Statblocks\'', () => {
    withStatblockEditor(app());
    const { fileMenu } = registered();
    const folder = recordingMenu();
    fileMenu(folder.menu, new TFolder('World/Swamp'));
    expect(folder.titles).toEqual(['New statblock here']);
    folder.click('New statblock here');
    expect(startStatblockCreation).toHaveBeenCalledWith(app(), { collectionId: null, folder: 'World/Swamp', from: 'command' });

    const plain = recordingMenu();
    fileMenu(plain.menu, new TFile(PLAIN));
    expect(plain.titles).toEqual([]);

    const fantasy = recordingMenu();
    fileMenu(fantasy.menu, new TFile(FANTASY));
    expect(fantasy.titles).toEqual(['Edit with an Atlas template…']);

    const native = recordingMenu();
    fileMenu(native.menu, new TFile(NATIVE));
    expect(native.titles).toEqual(['Edit statblock in Atlas']);
    native.click('Edit statblock in Atlas');
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: NATIVE, collectionId: null, from: 'command' });
  });
});
