// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { capsuleMenuEntries } from '../../../src/app/statblocks/editor/template-editor/shell/capsuleMenu';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import { SystemTab } from '../../../src/app/react/components/collection-settings/SystemTab';
import { DiceSetList } from '../../../src/app/react/components/collection-settings/dice-lab/DiceSetList';
import { TemplateList } from '../../../src/app/statblocks/settings/TemplateList';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { SystemPresetService } from '../../../src/app/services/SystemPresetService';
import type { LibraryTemplate } from '../../../src/app/statblocks/model/resolvedTypes';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';
import { memoryPresets } from '../../mocks/memoryPresets';

const hosted = vi.hoisted(() => ({ show: vi.fn(), save: vi.fn(), create: vi.fn() }));
vi.mock('../../../src/app/statblocks/editor/hostedDialog', () => ({ showHostedDialog: hosted.show }));
vi.mock('../../../src/app/services/itemBundle/itemExport', () => ({ saveItemBundle: hosted.save }));
vi.mock('../../../src/app/armarium/upload/createShareSession', () => ({ createItemShareSession: hosted.create }));
vi.mock('../../../src/app/statblocks/settings/useTemplateNoteCounts', () => ({ useTemplateNoteCounts: () => new Map() }));

const { itemShareEntries } = await import('../../../src/app/armarium/share/openItemShare');

const app = {} as App;
const SHARE = 'Share in the Armarium…';
const EXPORT = 'Export…';

const labels = (entries: readonly ContextMenuEntry[]): (string | false)[] => entries.map((entry) => entry.type === 'item' && entry.label);

/** Opens the menu behind `trigger` and reads its rows. */
async function menuRows(trigger: HTMLElement): Promise<string[]> {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return (await screen.findAllByRole('menuitem')).map((row) => row.textContent ?? '');
}

function withApp(children: React.ReactNode): React.JSX.Element {
  return <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>{children}</AtlasUIContext.Provider>;
}

beforeEach(() => {
  hosted.show.mockReset();
  hosted.save.mockReset();
  hosted.create.mockReset();
});
afterEach(cleanup);

describe('an item\'s Armarium rows', () => {
  const item = { kind: 'dice-set', id: 'bone-dice', name: 'Bone dice' } as const;

  it('shares the item in a dialog over whatever is open, and exports it as a file', () => {
    const start = vi.fn();
    hosted.create.mockReturnValue({ start });
    const [share, exported] = itemShareEntries(app, item);
    expect(labels([share!, exported!])).toEqual([SHARE, EXPORT]);

    if (share?.type === 'item') share.onClick();
    expect(hosted.create).toHaveBeenCalledWith(app, item);
    expect(start).toHaveBeenCalledTimes(1);
    expect(hosted.show).toHaveBeenCalledTimes(1);

    if (exported?.type === 'item') exported.onClick();
    expect(hosted.save).toHaveBeenCalledWith(app, item);
  });

  it('stands in the template editor\'s menu before Delete', () => {
    const entries = capsuleMenuEntries({ share: itemShareEntries(app, { kind: 'statblock-template', id: 'goblin-k2f9a1', name: 'Goblin' }), deleteTemplate: vi.fn() });
    expect(labels(entries)).toEqual([SHARE, EXPORT, 'Delete template…']);
    expect(labels(capsuleMenuEntries({}))).toEqual(['Delete template…']);
  });
});

describe('the entry points of item shares', () => {
  it('offers a vault template\'s row Share and Export, and a built-in\'s neither', async () => {
    const own = { template: { id: 'goblin-k2f9a1' }, name: 'Goblin', status: 'ok', builtIn: false, path: 'atlas-vtt/statblock-templates/Goblin.atlastemplate' } as unknown as LibraryTemplate;
    const builtIn = { template: { id: 'builtin:generic-creature' }, name: 'Creature', status: 'ok', builtIn: true, path: null } as unknown as LibraryTemplate;
    render(
      <TemplateList
        app={app}
        roles={[{ id: 'creature', name: 'Creature', templateId: 'builtin:generic-creature' }]}
        systemTemplateIds={[]}
        library={{ templates: [own, builtIn], loading: false } as never}
        editBlocked={null}
        onUseForRole={vi.fn()}
        onReplaceTemplate={vi.fn()}
      />,
    );
    expect(await menuRows(screen.getByRole('button', { name: 'Actions for Goblin' }))).toEqual(expect.arrayContaining([SHARE, EXPORT]));
    cleanup();
    render(
      <TemplateList app={app} roles={[{ id: 'creature', name: 'Creature', templateId: 'builtin:generic-creature' }]} systemTemplateIds={[]}
        library={{ templates: [builtIn], loading: false } as never} editBlocked={null} onUseForRole={vi.fn()} onReplaceTemplate={vi.fn()} />,
    );
    const rows = await menuRows(screen.getByRole('button', { name: 'Actions for Creature' }));
    expect(rows).not.toContain(SHARE);
    expect(rows).not.toContain(EXPORT);
  });

  it('offers a user game system\'s menu Share and Export, and gives a built-in none', async () => {
    const service = new SystemPresetService(memoryPresets([{ id: 'homebrew', name: 'Homebrew', rules: structuredClone(BUILT_IN_SYSTEM_PRESETS[1]!.rules) }]));
    const own = service.list().find((preset) => preset.id === 'homebrew')!;
    render(withApp(
      <SystemTab service={service} presets={service.list()} rules={own.rules} presetId={own.id} onApplyPreset={vi.fn()} onPresetIdChange={vi.fn()} onDeletePreset={vi.fn()} />,
    ));
    const menus = screen.getAllByRole('button', { name: 'Preset actions' });
    expect(menus).toHaveLength(1);
    expect(await menuRows(menus[0]!)).toEqual(expect.arrayContaining([SHARE, EXPORT]));
  });

  it('offers a dice set of the vault Share and Export from its menu, and a built-in set no menu', async () => {
    const sets = [
      { id: 'builtin:d20', name: 'd20', builtIn: true, dice: [{ count: 1, sides: 20 }] },
      { id: 'bone-dice', name: 'Bone dice', builtIn: false, dice: [{ count: 2, sides: 6 }] },
    ] as unknown as DiceSet[];
    render(withApp(
      <DiceSetList sets={sets} selectedId="bone-dice" newSetName={null} canEdit onSelect={vi.fn()} onCreate={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    ));
    const list = screen.getByRole('list', { name: 'Dice sets' });
    expect(within(list).queryByRole('button', { name: 'More for d20' })).toBeNull();
    expect(await menuRows(within(list).getByRole('button', { name: 'More for Bone dice' }))).toEqual([SHARE, EXPORT]);
  });
});
