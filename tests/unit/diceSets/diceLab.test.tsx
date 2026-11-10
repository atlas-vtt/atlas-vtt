// @vitest-environment jsdom
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL: the tray shows its dice without pictures.
vi.mock('../../../src/app/dice3d/dieImages', () => ({ dieImage: () => null, drawDieImages: async () => undefined }));
import { collectionDiceSet } from '../../../src/app/gameSystems/diceSetResolution';
import { TooltipProvider } from '../../../src/app/packages/components/primitives/tooltip';
import { DiceTab } from '../../../src/app/react/components/collection-settings/DiceTab';
import { DiceSetService } from '../../../src/app/services/diceSets/DiceSetService';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';
import { memoryPresets } from '../../mocks/memoryPresets';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Tab({ service, current, onPick }: { service: DiceSetService; current: DiceSet; onPick: (set: DiceSet) => void }): React.ReactElement {
  const [sets, setSets] = useState(() => service.list());
  useEffect(() => service.onChange(() => setSets(service.list())), [service]);
  return <TooltipProvider><DiceTab diceSet={current} diceSets={{ service, sets }} onPick={onPick} /></TooltipProvider>;
}

const DUALITY = { id: 'duality', name: 'Duality', crit: 'doubles', dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }] };
const HORDE = { id: 'horde', name: 'Horde', crit: 'natural', dice: [{ count: 2, sides: 6, colour: '#4d7c0f' }] };

type Stored = Array<Record<string, unknown> & { id: string }>;

/** Opens the lab from the Dice tab on the set `openId`; counts every write to the library. */
function setup(initial: Stored = [DUALITY, HORDE], openId = 'duality') {
  vi.useFakeTimers();
  const storage = memoryPresets(initial);
  const writes = { count: 0 };
  const counted: typeof storage = {
    ...storage,
    create: (entry) => { writes.count++; storage.create(entry); },
    update: (id, change) => { writes.count++; storage.update(id, change); },
  };
  const service = new DiceSetService(counted);
  const current = service.list().find((set) => set.id === openId) ?? collectionDiceSet({}, [], []);
  render(<Tab service={service} current={current} onPick={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open dice lab' }));
  return { storage, writes };
}

const lab = (): HTMLElement => screen.getByRole('dialog', { name: 'Dice lab' });
const tray = (): HTMLElement => within(lab()).getByRole('group', { name: /^Dice of / });
const rest = (): void => { act(() => { vi.advanceTimersByTime(500); }); };
const groups = (storage: ReturnType<typeof memoryPresets>, id: string): unknown => storage.current().find((entry) => entry.id === id)?.dice;
const openFan = (name: string): void => { fireEvent.click(within(tray()).getByRole('button', { name })); };
const fanButton = (name: RegExp | string): HTMLElement => within(tray()).getByRole('button', { name });

describe('the dice lab', () => {
  it('opens from the Dice tab on the set in use, its dice on the tray each named for screen readers', () => {
    setup();
    expect(within(lab()).getByRole('heading', { name: 'Duality' })).toBeTruthy();
    expect(within(tray()).getByRole('button', { name: 'Hope, d12, gold' })).toBeTruthy();
    expect(within(tray()).getByRole('button', { name: 'Fear, d12, purple' })).toBeTruthy();
    expect(within(tray()).getByRole('button', { name: 'Add a die' })).toBeTruthy();
  });

  it('shows a group of two as two dice and adds a die like the last with one write', () => {
    const { storage, writes } = setup();
    fireEvent.click(within(lab()).getByRole('button', { name: /^Horde/ }));
    expect(within(tray()).getAllByRole('button', { name: 'd6, moss' })).toHaveLength(2);
    fireEvent.click(within(tray()).getByRole('button', { name: 'Add a die' }));
    expect(writes.count).toBe(1);
    expect(groups(storage, 'horde')).toEqual([{ count: 2, sides: 6, colour: '#4d7c0f' }, { count: 1, sides: 6 }]);
  });

  it('changes one die of a group alone, splitting it out, and merges it back when it matches again', () => {
    const { storage, writes } = setup();
    fireEvent.click(within(lab()).getByRole('button', { name: /^Horde/ }));
    fireEvent.click(within(tray()).getAllByRole('button', { name: 'd6, moss' })[1]!);
    fireEvent.click(fanButton(/^Colour:/));
    fireEvent.click(within(tray()).getByRole('button', { name: 'Crimson' }));
    expect(groups(storage, 'horde')).toEqual([{ count: 1, sides: 6, colour: '#4d7c0f' }, { count: 1, sides: 6, colour: '#b91c1c' }]);
    fireEvent.click(within(tray()).getByRole('button', { name: 'Moss' }));
    expect(groups(storage, 'horde')).toEqual([{ count: 2, sides: 6, colour: '#4d7c0f' }]);
    expect(writes.count).toBe(2);
  });

  it('writes each fan action once: sides, name, colour, copy and remove', () => {
    const { storage, writes } = setup();
    openFan('Hope, d12, gold');
    fireEvent.click(fanButton(/^Sides:/));
    fireEvent.click(within(tray()).getByRole('button', { name: 'd8' }));
    expect(writes.count).toBe(1);
    expect(groups(storage, 'duality')).toMatchObject([{ count: 1, sides: 8, name: 'Hope' }, { sides: 12 }]);

    fireEvent.click(fanButton('Name'));
    const name = within(tray()).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Ho' } });
    fireEvent.change(name, { target: { value: 'Hop' } });
    fireEvent.change(name, { target: { value: 'Hops' } });
    expect(writes.count).toBe(1);
    rest();
    expect(writes.count).toBe(2);
    expect(groups(storage, 'duality')).toMatchObject([{ name: 'Hops' }, { name: 'Fear' }]);

    fireEvent.click(fanButton(/^Colour:/));
    fireEvent.click(within(tray()).getByRole('button', { name: 'Dice look' }));
    expect(writes.count).toBe(3);
    expect((groups(storage, 'duality') as object[])[0]).not.toHaveProperty('colour');

    fireEvent.click(fanButton('Add a copy'));
    expect(writes.count).toBe(4);
    expect(groups(storage, 'duality')).toMatchObject([{ count: 2, sides: 8, name: 'Hops' }, { count: 1, name: 'Fear' }]);

    fireEvent.click(fanButton('Remove'));
    expect(writes.count).toBe(5);
    expect(groups(storage, 'duality')).toMatchObject([{ count: 1, sides: 8 }, { count: 1, name: 'Fear' }]);
  });

  it('keeps the last die and refuses dice past the set\'s limits, saying why', () => {
    const { storage, writes } = setup([
      { id: 'one', name: 'One', crit: 'natural', dice: [{ count: 1, sides: 20 }] },
      { id: 'full', name: 'Full', crit: 'natural', dice: [{ count: 20, sides: 6 }] },
    ], 'one');
    openFan('d20, dice look');
    const remove = fanButton('A set rolls at least one die');
    fireEvent.click(remove);
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(groups(storage, 'one')).toEqual([{ count: 1, sides: 20 }]);

    fireEvent.click(within(lab()).getByRole('button', { name: /^Full/ }));
    const add = within(tray()).getByRole('button', { name: 'A set rolls at most 20 dice' });
    fireEvent.click(add);
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(writes.count).toBe(0);
  });

  it('shows a built-in set read-only and duplicates it to be changed', () => {
    const { storage } = setup([], 'builtin:d20');
    expect(within(lab()).getByRole('heading', { name: 'd20' })).toBeTruthy();
    expect(within(tray()).queryAllByRole('button')).toHaveLength(0);
    expect(within(tray()).getByRole('img', { name: 'd20, dice look' })).toBeTruthy();
    expect((within(lab()).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(lab()).getByRole('button', { name: 'Duplicate to edit' }));
    expect(storage.current()).toMatchObject([{ name: 'd20 copy', dice: [{ count: 1, sides: 20 }], crit: 'natural' }]);
    expect(within(lab()).getByRole('heading', { name: 'd20 copy' })).toBeTruthy();
    expect(within(tray()).getByRole('button', { name: 'd20, dice look' })).toBeTruthy();
  });

  it('begins a new set empty and makes it with its first die, a d20', () => {
    const { storage, writes } = setup();
    fireEvent.click(within(lab()).getByRole('button', { name: 'New set' }));
    expect(within(tray()).getByText('Add the first die')).toBeTruthy();
    expect(within(tray()).getAllByRole('button')).toHaveLength(1);
    rest();
    expect(writes.count).toBe(0);
    fireEvent.click(within(tray()).getByRole('button', { name: 'Add a die' }));
    expect(writes.count).toBe(1);
    expect(storage.current().at(-1)).toMatchObject({ name: 'New dice set', dice: [{ count: 1, sides: 20 }], crit: 'natural' });
    fireEvent.click(within(tray()).getByRole('button', { name: 'Add a die' }));
    expect(writes.count).toBe(2);
    expect(storage.current().at(-1)).toMatchObject({ dice: [{ count: 2, sides: 20 }] });
  });

  it('never writes a name another set has, and says why', () => {
    const { storage } = setup();
    fireEvent.change(within(lab()).getByRole('textbox', { name: 'Name' }), { target: { value: 'Horde' } });
    rest();
    expect(within(lab()).getByRole('alert').textContent).toBe('Another dice set has this name.');
    expect(storage.current()[0]).toMatchObject({ name: 'Duality' });
  });

  it('deletes a set of the vault after a second press', () => {
    const { storage } = setup();
    fireEvent.click(within(lab()).getByRole('button', { name: 'Delete Horde' }));
    expect(storage.current()).toHaveLength(2);
    fireEvent.click(within(lab()).getByRole('button', { name: 'Delete Horde? Press again' }));
    expect(storage.current().map((entry) => entry.id)).toEqual(['duality']);
  });

  it('is worked from the keyboard: a die opens its fan, the arrows move along it, Escape steps back', async () => {
    setup();
    // What closes leaves with its animation, on the browser's frames
    vi.useRealTimers();
    // A click from the keyboard (Enter or Space) has no pointer detail
    fireEvent.click(within(tray()).getByRole('button', { name: 'Hope, d12, gold' }), { detail: 0 });
    const fan = within(tray()).getByRole('group', { name: 'Hope, d12, gold' });
    const buttons = within(fan).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1]!, { key: 'ArrowLeft' });
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(buttons[4]);

    // Sides opens its step on the die's own sides
    fireEvent.click(buttons[0]!, { detail: 0 });
    expect(document.activeElement).toBe(within(tray()).getByRole('button', { name: 'd12' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(within(tray()).queryByRole('button', { name: 'd8' })).toBeNull());
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(buttons[0]!, { key: 'Escape' });
    await waitFor(() => expect(within(tray()).queryByRole('group', { name: 'Hope, d12, gold' })).toBeNull());
    expect(document.activeElement).toBe(within(tray()).getByRole('button', { name: 'Hope, d12, gold' }));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Dice lab' })).toBeNull();
  });

  it('moves a die with Alt and an arrow key, in one write', () => {
    const { storage, writes } = setup();
    fireEvent.keyDown(within(tray()).getByRole('button', { name: 'Fear, d12, purple' }), { key: 'ArrowLeft', altKey: true });
    expect(writes.count).toBe(1);
    expect(groups(storage, 'duality')).toMatchObject([{ name: 'Fear' }, { name: 'Hope' }]);
  });
});
