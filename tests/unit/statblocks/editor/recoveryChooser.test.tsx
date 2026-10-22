// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import type { App } from 'obsidian';
import type { RecoveryButton } from '../../../../src/app/recovery/recoveryTypes';
import type { RestChoices } from '../../../../src/app/recovery/restTypes';
import type { AllyRests } from '../../../../src/app/recovery/restWrites';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'pc-k7m2qa',
  fields: [{ key: 'name', label: 'Name', type: 'text' }],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }] },
};

const HIT_DICE_SPEND = { target: { kind: 'resource', field: 'hp' }, does: 'spend', from: { kind: 'resource', field: 'hitDice' }, each: '1d8+@con' } as const;

const DOWNTIME: RecoveryButton = {
  id: 'downtime',
  name: 'Downtime',
  rules: [HIT_DICE_SPEND],
  choices: [
    {
      id: 'moves', prompt: 'Choose two downtime moves', min: 2, max: 2,
      actions: [
        { id: 'tend', name: 'Tend to Wounds', text: 'Clear 1d4 HP.', rules: [{ target: { kind: 'resource', field: 'hp' }, does: 'amount', formula: '1d4' }], forOthers: true },
        { id: 'project', name: 'Work on a Project', rules: [] },
        { id: 'wind', name: 'Second Wind', rules: [HIT_DICE_SPEND] },
      ],
    },
    { id: 'boons', prompt: 'Up to two boons', min: 0, max: 2, repeat: true, actions: [{ id: 'boon', name: 'Boon', rules: [], forOthers: true }] },
  ],
};
const LONG: RecoveryButton = { id: 'long', name: 'Long rest', rules: [{ target: { kind: 'resource', field: 'hp' }, does: 'full' }] };

const pc = (id: string, name: string, extra: Record<string, unknown>): Record<string, unknown> => ({
  id, name, type: 'token', imagePath: `${id}.webp`, tags: [], collection: 'campaign', createdAt: 1, modifiedAt: 1, playerCharacter: true, ...extra,
});
const MIRA = pc('mira', 'Mira', { statblockPath: NOTE_PATH });
const BRAM = pc('bram', 'Bram', { statblockPath: 'Party/Bram.md' });
const CORA = pc('cora', 'Cora', { statblockPath: 'Elsewhere/Cora.md', collection: 'other' });
const GHOST = pc('ghost', 'Ghost', { statblockPath: 'Party/Ghost.md' });
const NPC = { ...pc('npc', 'Innkeeper', { statblockPath: 'Party/Innkeeper.md' }), playerCharacter: undefined };

const takeRest = vi.hoisted(() => vi.fn());
const showNotice = vi.hoisted(() => vi.fn());
const allyNotes = vi.hoisted(() => new Map<string, string>([['Party/Bram.md', 'bram'], ['Elsewhere/Cora.md', 'cora'], ['Party/Innkeeper.md', 'npc']]));

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [NPC, GHOST, CORA, BRAM, MIRA],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../../../src/app/react/hooks/useExperimentalFeature', () => ({ useExperimentalFeature: () => true }));
vi.mock('../../../../src/app/recovery/takeRest', () => ({ takeRest }));
vi.mock('../../../../src/app/recovery/characterRest', async () => {
  const { character } = await import('../../recovery/restFixtures');
  const resting = character({ resources: { hp: { current: 3, max: 20 }, hitDice: { current: 2, max: 4 } }, note: { con: 1 } });
  return {
    characterRestOf: () => ({ character: resting, holds: [] }),
    // Only Bram's note (of the other player characters) is a native statblock; Ghost's is not.
    characterRest: (_app: unknown, path: string) => {
      const id = allyNotes.get(path);
      return id ? { asset: { id, name: id.charAt(0).toUpperCase() + id.slice(1) }, notePath: path } : null;
    },
  };
});
vi.mock('../../../../src/app/ui/notice', () => ({ showNotice }));

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function openChooser(): Promise<{ harness: PaneHarness; dialog: HTMLElement }> {
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({ template: { ...TEMPLATE, recovery: [DOWNTIME, LONG] }, name: 'PC', status: 'ok', builtIn: false, path: 'Templates/PC.atlastemplate' });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': TEMPLATE.id, name: 'Mira' } });
  apps.push(harness.app);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Downtime' })); });
  return { harness, dialog: screen.getByRole('dialog', { name: 'Downtime' }) };
}

const press = async (element: HTMLElement): Promise<void> => {
  await act(async () => { fireEvent.click(element); });
};
const rest = (dialog: HTMLElement): HTMLButtonElement => within(dialog).getByRole('button', { name: 'Rest' });
const step = (dialog: HTMLElement, prompt: string): HTMLElement => within(dialog).getByRole('region', { name: prompt });
const actionTile = (dialog: HTMLElement, name: string): HTMLElement => within(dialog).getByText(name).closest('li')!;

describe('The rest chooser of a recovery button with steps', () => {
  it('opens under a button with steps, while a button without them still rests at once', async () => {
    takeRest.mockResolvedValue({ summary: { text: 'Long rest: HP 3 → 20' }, problem: null });
    const { dialog } = await openChooser();
    expect(within(dialog).getByText('Choose two downtime moves')).toBeTruthy();
    expect(within(step(dialog, 'Choose two downtime moves')).getByText('0 of 2')).toBeTruthy();
    expect(within(step(dialog, 'Choose two downtime moves')).getByText('Pick 2 more.')).toBeTruthy();
    expect(within(dialog).getByText('Clear 1d4 HP.')).toBeTruthy();
    expect(rest(dialog).disabled).toBe(true);
    await act(async () => { fireEvent.keyDown(dialog, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Downtime' }));
    await press(screen.getByRole('button', { name: 'Long rest' }));
    expect(takeRest.mock.calls[0]![2]).toBe('long');
  });

  it('takes exactly as many actions as the step asks for, and no more', async () => {
    const { dialog } = await openChooser();
    const moves = step(dialog, 'Choose two downtime moves');
    await press(within(moves).getByRole('switch', { name: 'Tend to Wounds' }));
    expect(within(moves).getByText('Pick one more.')).toBeTruthy();
    expect(rest(dialog).disabled).toBe(true);
    await press(within(moves).getByRole('switch', { name: 'Work on a Project' }));
    expect(within(moves).getByText('2 of 2')).toBeTruthy();
    expect(within(moves).queryByText(/Pick/)).toBeNull();
    const wind = within(moves).getByRole('switch', { name: 'Second Wind' });
    expect(wind.getAttribute('aria-disabled')).toBe('true');
    await press(wind);
    expect(wind.getAttribute('aria-checked')).toBe('false');
    expect(rest(dialog).disabled).toBe(false);
    await press(within(moves).getByRole('switch', { name: 'Tend to Wounds' }));
    expect(rest(dialog).disabled).toBe(true);
  });

  it('counts an action picked more than once where the step repeats, up to its most', async () => {
    const { dialog } = await openChooser();
    const boons = step(dialog, 'Up to two boons');
    expect(within(boons).queryByText(/Pick/)).toBeNull();
    const more = within(boons).getByRole('button', { name: 'Take Boon once more' });
    await press(more);
    await press(more);
    expect(within(boons).getByRole('group', { name: 'Boon' }).textContent).toContain('2');
    expect(within(boons).getByText('2 of 2')).toBeTruthy();
    expect((more as HTMLButtonElement).disabled).toBe(true);
    // Each pick of an action taken for another asks for whom on its own.
    expect(within(boons).getAllByRole('combobox').length).toBe(2);
    await press(within(boons).getByRole('button', { name: 'Take Boon once fewer' }));
    expect(within(boons).getByText('1 of 2')).toBeTruthy();
  });

  it('offers an action taken for another to the other player characters of the collection with a native statblock', async () => {
    const { dialog } = await openChooser();
    const tend = actionTile(dialog, 'Tend to Wounds');
    expect(within(tend).queryByRole('combobox')).toBeNull();
    await press(within(tend).getByRole('switch', { name: 'Tend to Wounds' }));
    // An action only taken for oneself asks nobody.
    await press(within(dialog).getByRole('switch', { name: 'Work on a Project' }));
    expect(within(actionTile(dialog, 'Work on a Project')).queryByRole('combobox')).toBeNull();
    const whom = within(tend).getByRole('combobox', { name: 'For' });
    expect(whom.textContent).toBe('Mira');
    await press(whom);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Mira', 'Bram']);
  });

  it('rests with the picks, whom each is for, every spend by its rule and the allies the rest may change', async () => {
    takeRest.mockResolvedValue({ summary: { text: 'Downtime (Tend to Wounds, Second Wind): Bram: HP 4 → 7' }, problem: null });
    const { dialog } = await openChooser();
    await press(within(dialog).getAllByRole('button', { name: 'Spend one Hit Dice more' })[0]!);
    await press(within(dialog).getByRole('switch', { name: 'Second Wind' }));
    await press(within(dialog).getByRole('switch', { name: 'Tend to Wounds' }));
    await press(within(actionTile(dialog, 'Second Wind')).getByRole('button', { name: 'Spend one Hit Dice more' }));
    await press(within(actionTile(dialog, 'Tend to Wounds')).getByRole('combobox', { name: 'For' }));
    await press(screen.getByRole('option', { name: 'Bram' }));
    await press(within(dialog).getByRole('button', { name: 'Take Boon once more' }));
    await press(rest(dialog));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(takeRest).toHaveBeenCalledTimes(1);
    const [, , buttonId, choices, , , allies] = takeRest.mock.calls[0]! as [unknown, unknown, string, RestChoices, unknown, unknown, AllyRests];
    expect(buttonId).toBe('downtime');
    expect(choices.picks).toEqual([
      { choice: 'moves', action: 'tend', for: 'bram' },
      { choice: 'moves', action: 'wind', for: null },
      { choice: 'boons', action: 'boon', for: null },
    ]);
    expect([...choices.spends]).toEqual([['always:0', 1], ['pick:1:0', 1]]);
    expect(allies('bram')?.asset.id).toBe('bram');
    expect(allies('cora')).toBeNull();
    expect(showNotice).toHaveBeenCalledWith('Downtime (Tend to Wounds, Second Wind): Bram: HP 4 → 7');
  });
});
