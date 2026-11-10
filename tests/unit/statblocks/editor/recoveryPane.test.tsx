// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { RecoveryButton } from '../../../../src/app/recovery/recoveryTypes';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'pc-k7m2qa',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'uses', label: 'Uses', type: 'counters' },
  ],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, { id: 'uses0001', type: 'counters', field: 'uses' }] },
};

const BUTTONS: RecoveryButton[] = [
  { id: 'short', name: 'Short rest', rules: [{ target: { kind: 'counters', field: 'uses', rows: ['short'] }, does: 'full' }] },
  { id: 'long', name: 'Long rest', rules: [{ target: { kind: 'resource', field: 'hp' }, does: 'full' }] },
  {
    id: 'breath', name: 'Catch breath',
    rules: [{ target: { kind: 'resource', field: 'hp' }, does: 'spend', from: { kind: 'resource', field: 'hitDice' }, each: '1d8+@con' }],
  },
];

const library = vi.hoisted(() => ({ tokens: [] as unknown[] }));
const takeRest = vi.hoisted(() => vi.fn());
const showNotice = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => library.tokens,
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../../../src/app/react/hooks/useExperimentalFeature', () => ({ useExperimentalFeature: () => true }));
vi.mock('../../../../src/app/recovery/takeRest', () => ({ takeRest }));
vi.mock('../../../../src/app/recovery/characterRest', async () => {
  const { character } = await import('../../recovery/restFixtures');
  const resting = character({ resources: { hp: { current: 3, max: 20 }, hitDice: { current: 2, max: 4 } }, note: { con: 1 } });
  return { characterRestOf: () => ({ character: resting, holds: [] }) };
});
vi.mock('../../../../src/app/ui/notice', () => ({ showNotice }));

const MIRA = { id: 'mira', type: 'token', name: 'Mira', imagePath: 'mira.webp', tags: [], collection: 'campaign', createdAt: 1, modifiedAt: 1, playerCharacter: true, statblockPath: NOTE_PATH };

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  library.tokens = [];
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(values: Record<string, unknown>): Promise<PaneHarness> {
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({ template: { ...TEMPLATE, recovery: [...BUTTONS] }, name: 'PC', status: 'ok', builtIn: false, path: 'Templates/PC.atlastemplate' });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': TEMPLATE.id, name: 'Mira', ...values } });
  apps.push(harness.app);
  return harness;
}

const openMenu = async (trigger: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.keyDown(trigger, { key: 'Enter' });
  });
};

describe('Recovery buttons in the statblock pane', () => {
  it('shows a player character\'s buttons under the header, and none on a note no player character links', async () => {
    const plain = await pane({});
    expect(plain.result.container.querySelector('.atlas-sb-recovery')).toBeNull();
    cleanup();
    library.tokens = [MIRA];
    const harness = await pane({});
    const group = harness.result.container.querySelector<HTMLElement>('.atlas-sb-recovery');
    expect(group?.getAttribute('aria-label')).toBe('Recovery of Mira');
    expect([...group!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Short rest', 'Long rest', 'Catch breath']);
  });

  it('takes a rest at once and says what it did', async () => {
    library.tokens = [MIRA];
    takeRest.mockResolvedValue({ summary: { text: 'Long rest: HP 4 → 20' }, problem: null });
    const harness = await pane({});
    const long = [...harness.result.container.querySelectorAll<HTMLElement>('.atlas-sb-recovery__button')][1]!;
    await act(async () => { fireEvent.click(long); });
    expect(takeRest).toHaveBeenCalledTimes(1);
    const [, , buttonId, choices] = takeRest.mock.calls[0]! as [unknown, unknown, string, { spends: Map<number, number> }];
    expect(buttonId).toBe('long');
    expect([...choices.spends]).toEqual([]);
    expect(showNotice).toHaveBeenCalledWith('Long rest: HP 4 → 20');
  });

  it('asks how many to spend before a rest that spends something, never more than the character holds', async () => {
    library.tokens = [MIRA];
    takeRest.mockResolvedValue({ summary: { text: 'Catch breath: HP 3 → 12' }, problem: null });
    const harness = await pane({});
    const breath = [...harness.result.container.querySelectorAll<HTMLElement>('.atlas-sb-recovery__button')][2]!;
    await openMenu(breath);
    const hitDice = screen.getByRole('menuitem', { name: /Hit Dice/ });
    expect(hitDice.textContent).toContain('1d8+1 each');
    for (let press = 0; press < 3; press += 1) await act(async () => { fireEvent.keyDown(hitDice, { key: '+' }); });
    expect(hitDice.textContent).toContain('2 of 2');
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Rest' })); });
    const [, , buttonId, choices] = takeRest.mock.calls[0]! as [unknown, unknown, string, { spends: Map<number, number> }];
    expect(buttonId).toBe('breath');
    expect([...choices.spends]).toEqual([['always:0', 2]]);
  });

  it('lets each row of counters name the rest that gives its uses back', async () => {
    library.tokens = [MIRA];
    const uses = [{ name: 'Wand', max: 3, used: 1 }];
    const harness = await pane({ uses });
    const picker = harness.result.container.querySelector<HTMLElement>('.atlas-sb-counter__reset')!;
    expect(picker.textContent).toBe('');
    await openMenu(picker);
    await act(async () => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Short rest' })); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['uses'], base: uses, next: [{ name: 'Wand', max: 3, used: 1, reset: 'short' }] }]);
  });
});
