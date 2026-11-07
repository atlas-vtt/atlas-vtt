// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { renderPane, type PaneHarness } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [], dice: { defaultRoll: '1d20', crit: 'natural' } }),
    findTokenAssetByImagePath: () => null,
    initialize: async () => undefined,
    getTokenAssets: async () => [],
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
// No WebGL here: rolls show as the result card, as they do on a machine without it.
vi.mock('../../../../src/app/dice3d/stagePool', () => ({ canShowDice: () => false, warmStages: () => undefined }));
vi.mock('../../../../src/app/audio/diceRevealSound', () => ({ playDiceReveal: vi.fn(async () => undefined) }));

const WARDEN = {
  statblock: true,
  'atlas-template': 'builtin:generic-creature',
  name: 'Marsh Warden',
  actions: [{ name: 'Bite', desc: 'Melee: +4 to hit. Hit: 1d6 + 2 piercing.' }],
};

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: WARDEN });
  apps.push(harness.app);
  // Markdown in the card renders in an effect: its dice links come with it.
  await waitFor(() => expect(document.querySelector('.atlas-dice-link')).not.toBeNull());
  return harness;
}

const die = (formula: string): HTMLElement => {
  const link = [...document.querySelectorAll<HTMLElement>('.atlas-dice-link')].find((el) => el.dataset.formula === formula);
  if (!link) throw new Error(`No die ${formula}`);
  return link;
};

describe('dice in the statblock beside its note, with no map open', () => {
  it('roll on a click and show the result in the pane, without starting to edit', async () => {
    const { writer } = await pane();
    await act(async () => { fireEvent.click(die('1d6+2')); });
    const rolls = document.querySelector('.atlas-sb-pane-rolls')!;
    await waitFor(() => expect(rolls.querySelector('.atlas-dice-toast')).not.toBeNull());
    expect(rolls.textContent).toContain('Bite');
    expect(document.querySelector('.atlas-sb-pane-editing')).toBeNull();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(writer.writes).toEqual([]);
  });

  it('roll a bare bonus with the collection\'s default die', async () => {
    await pane();
    await act(async () => { fireEvent.click(die('+4')); });
    await waitFor(() => expect(document.querySelector('.atlas-sb-pane-rolls .atlas-dice-toast')).not.toBeNull());
    expect(document.querySelector('.atlas-sb-pane-rolls')!.textContent).toMatch(/1d20/i);
  });

  it('are reached with Tab and roll on Enter', async () => {
    await pane();
    const link = die('1d6+2');
    expect(link.tabIndex).toBe(0);
    expect(link.getAttribute('role')).toBe('button');
    link.focus();
    await act(async () => { fireEvent.keyDown(link, { key: 'Enter' }); });
    await waitFor(() => expect(document.querySelector('.atlas-sb-pane-rolls .atlas-dice-toast')).not.toBeNull());
    expect(document.querySelector('.atlas-sb-pane-editing')).toBeNull();
  });

  it('leave the rest of the value to editing: a click beside a die edits', async () => {
    await pane();
    const entry = die('1d6+2').closest<HTMLElement>('[data-block-id]')!;
    await act(async () => { fireEvent.click(entry); });
    expect(document.querySelector('.atlas-sb-pane-editing')).not.toBeNull();
    expect(document.querySelector('.atlas-sb-pane-rolls .atlas-dice-toast')).toBeNull();
  });
});

const GEAR: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'gear-k7m2qa',
  fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'gear', label: 'Gear', type: 'scores', slots: ['Item', 'Damage'] }],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, { id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' }] },
};

async function gearPane(): Promise<PaneHarness> {
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({ template: GEAR, name: 'Gear', status: 'ok', builtIn: false, path: 'Templates/Gear.atlastemplate' });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': GEAR.id, name: 'Marsh Warden', gear: [['Sword', '2d6+3'], ['Bow', '(+5)']] } });
  apps.push(harness.app);
  return harness;
}

describe('dice in a table cell of the statblock beside its note', () => {
  it('roll on a click, a bare bonus with the default die, and type no cell', async () => {
    const { writer } = await gearPane();
    await act(async () => { fireEvent.click(die('2d6+3')); });
    await waitFor(() => expect(document.querySelector('.atlas-sb-pane-rolls .atlas-dice-toast')).not.toBeNull());
    await act(async () => { fireEvent.click(die('+5')); });
    await waitFor(() => expect(document.querySelector('.atlas-sb-pane-rolls')!.textContent).toMatch(/1d20/i));
    expect(document.querySelector('.atlas-sb-sheet-table textarea')).toBeNull();
    expect(writer.writes).toEqual([]);
  });

  it('leave the rest of the cell to typing: a click beside a die types the cell', async () => {
    await gearPane();
    const cell = die('2d6+3').closest<HTMLElement>('td')!;
    await act(async () => { fireEvent.click(cell); });
    expect(cell.querySelector('textarea')?.value).toBe('2d6+3');
  });
});
