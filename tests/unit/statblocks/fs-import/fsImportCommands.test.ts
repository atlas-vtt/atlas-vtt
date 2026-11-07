// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type Command, type Menu, type Plugin } from 'obsidian';
import { addLayoutFileMenuItem, registerLayoutImportCommand } from '../../../../src/app/statblocks/editor/fs-import/fsImportCommands';
import { openTemplateEditor } from '../../../../src/app/statblocks/editor/openTemplateEditor';
import { TEMPLATE_FOLDER } from '../../../../src/app/statblocks/library/templatePaths';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { FOOTER_LAYOUT } from './fsImportKit';

vi.mock('../../../../src/app/statblocks/editor/openTemplateEditor', () => ({ openTemplateEditor: vi.fn(async () => null) }));

const LAYOUT_FILE = 'Downloads/Footer layout.json';
let vault: SessionVault;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  vault = sessionVault({ [LAYOUT_FILE]: JSON.stringify(FOOTER_LAYOUT), 'Downloads/notes.json': '{"name": "Not a layout"}' });
  await vault.settled();
});

afterEach(async () => {
  cleanup();
  document.body.replaceChildren();
  await closeSessionVault(vault);
  vi.restoreAllMocks();
  vi.mocked(openTemplateEditor).mockClear();
});

function command(): Command {
  const commands: Command[] = [];
  registerLayoutImportCommand({ app: vault.app, addCommand: (added: Command) => commands.push(added) } as unknown as Plugin);
  return commands[0]!;
}

function menuItems(file: TFile): Array<{ title: string; click: () => void }> {
  const items: Array<{ title: string; click: () => void }> = [];
  const menu = {
    addItem: (build: (item: unknown) => void) => {
      const entry = { title: '', click: () => undefined as void };
      const item = {
        setTitle: (title: string) => { entry.title = title; return item; },
        setIcon: () => item,
        onClick: (callback: () => void) => { entry.click = callback; return item; },
      };
      build(item);
      items.push(entry);
    },
  } as unknown as Menu;
  addLayoutFileMenuItem(vault.app, menu, file);
  return items;
}

const templateFiles = (): string[] => [...vault.files.keys()].filter((path) => path.startsWith(`${TEMPLATE_FOLDER}/`));

describe('importing a layout file (§6.2)', () => {
  it('offers nothing while the statblock editor is off', () => {
    expect(command().checkCallback?.(true)).toBe(false);
    expect(menuItems(new TFile(LAYOUT_FILE))).toEqual([]);
  });

  it('imports a JSON file of the vault from the file menu, opens its template and shows the report', async () => {
    withStatblockEditor(vault.app);
    expect(menuItems(new TFile('Bestiary/Bog.md'))).toEqual([]);
    const [item] = menuItems(new TFile(LAYOUT_FILE));
    expect(item?.title).toBe('Import as statblock template');
    item?.click();

    expect(await screen.findByRole('dialog', { name: 'Footer layout is ready' })).toBeTruthy();
    expect(templateFiles()).toEqual([`${TEMPLATE_FOLDER}/Footer layout.atlastemplate`]);
    expect(openTemplateEditor).toHaveBeenCalledWith(vault.app, expect.objectContaining({ path: `${TEMPLATE_FOLDER}/Footer layout.atlastemplate` }));
  });

  it('leaves a JSON file that is no layout alone', async () => {
    withStatblockEditor(vault.app);
    menuItems(new TFile('Downloads/notes.json'))[0]?.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(templateFiles()).toEqual([]);
    expect(openTemplateEditor).not.toHaveBeenCalled();
  });

  it('picks a layout file from the file system with the command', async () => {
    withStatblockEditor(vault.app);
    const run = command();
    expect(run.name).toBe('Import Fantasy Statblocks layout…');
    expect(run.checkCallback?.(true)).toBe(true);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    run.checkCallback?.(false);
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.accept).toBe('.json,application/json');
    expect(click).toHaveBeenCalled();
    // jsdom's File cannot read itself; Electron's can.
    const picked = { name: 'Footer layout.json', text: async (): Promise<string> => JSON.stringify(FOOTER_LAYOUT) };
    fireEvent.change(input, { target: { files: [picked] } });
    await waitFor(() => expect(templateFiles()).toEqual([`${TEMPLATE_FOLDER}/Footer layout.atlastemplate`]));
    expect(document.querySelector('input[type=file]')).toBeNull();
  });
});
