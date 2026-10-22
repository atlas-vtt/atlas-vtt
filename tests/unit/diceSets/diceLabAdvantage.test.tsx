// @vitest-environment jsdom
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL: the tray shows its dice without pictures.
vi.mock('../../../src/app/dice3d/dieImages', () => ({ dieImage: () => null, drawDieImages: async () => undefined }));
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

function Tab({ service, current }: { service: DiceSetService; current: DiceSet }): React.ReactElement {
  const [sets, setSets] = useState(() => service.list());
  useEffect(() => service.onChange(() => setSets(service.list())), [service]);
  return <TooltipProvider><DiceTab diceSet={current} diceSets={{ service, sets }} onPick={vi.fn()} /></TooltipProvider>;
}

type Stored = Array<Record<string, unknown> & { id: string }>;
const CHECKS = { id: 'checks', name: 'Checks', crit: 'natural', dice: [{ count: 1, sides: 20 }] };
const PERCENT = { id: 'percent', name: 'Percent', crit: 'roll-under', dice: [{ count: 1, sides: 100 }], advantage: { kind: 'keep' } };

/** Opens the lab on the set `openId`; counts every write to the library. */
function setup(initial: Stored, openId: string) {
  vi.useFakeTimers();
  const storage = memoryPresets(initial);
  const writes = { count: 0 };
  const service = new DiceSetService({
    ...storage,
    create: (entry) => { writes.count++; storage.create(entry); },
    update: (id, change) => { writes.count++; storage.update(id, change); },
  });
  render(<Tab service={service} current={service.list().find((set) => set.id === openId)!} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open dice lab' }));
  return { stored: () => storage.current().find((entry) => entry.id === openId)!, writes };
}

const lab = (): HTMLElement => screen.getByRole('dialog', { name: 'Dice lab' });
const tray = (): HTMLElement => within(lab()).getByRole('group', { name: /^Dice of / });
const rest = (): void => { act(() => { vi.advanceTimersByTime(500); }); };

/** Picks `option` in the dropdown of the row named `row`. */
function pick(row: string, option: string): void {
  fireEvent.keyDown(within(lab()).getByRole('button', { name: new RegExp(`^${row}`) }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: new RegExp(`^${option}`) }));
}

describe('advantage in the dice lab', () => {
  it('sets each side with one write per choice', () => {
    const { stored, writes } = setup([CHECKS], 'checks');
    pick('Advantage', 'Keep the best');
    expect(writes.count).toBe(1);
    expect(stored().advantage).toEqual({ kind: 'keep' });
    pick('Disadvantage', 'Subtract a number');
    expect(writes.count).toBe(2);
    expect(stored().disadvantage).toEqual({ kind: 'number', value: 2 });
    pick('Advantage', 'None');
    expect(writes.count).toBe(3);
    expect(stored()).not.toHaveProperty('advantage');
  });

  it('writes a typed number once typing rests, and waits while the field holds none', () => {
    const { stored, writes } = setup([{ ...CHECKS, advantage: { kind: 'number', value: 2 } }], 'checks');
    const field = within(lab()).getByRole('spinbutton', { name: 'Number' });
    fireEvent.change(field, { target: { value: '' } });
    rest();
    expect(writes.count).toBe(0);
    fireEvent.change(field, { target: { value: '3' } });
    rest();
    expect(writes.count).toBe(1);
    expect(stored().advantage).toEqual({ kind: 'number', value: 3 });
  });

  it('offers the tens die alone only for a d100 set', () => {
    const { stored, writes } = setup([PERCENT], 'percent');
    fireEvent.click(within(lab()).getByRole('checkbox', { name: 'Extra tens die only' }));
    expect(writes.count).toBe(1);
    expect(stored().advantage).toEqual({ kind: 'keep', tensOnly: true });
    expect(within(lab()).queryAllByRole('checkbox', { name: 'Extra tens die only' })).toHaveLength(1);
  });

  it('lays the die a side adds on the tray apart from the set\'s, set up with its fan, one write each', () => {
    const { stored, writes } = setup([CHECKS], 'checks');
    pick('Advantage', 'Add a die');
    expect(writes.count).toBe(1);
    const edgeDie = within(tray()).getByRole('button', { name: 'Advantage die: d6, dice look' });
    expect(edgeDie.closest('.atlas-dice-lab__edge-row')).not.toBeNull();

    fireEvent.click(edgeDie);
    expect(within(tray()).queryByRole('button', { name: 'Add a copy' })).toBeNull();
    fireEvent.click(within(tray()).getByRole('button', { name: /^Sides:/ }));
    fireEvent.click(within(tray()).getByRole('button', { name: 'd8' }));
    expect(writes.count).toBe(2);
    expect(stored().advantage).toEqual({ kind: 'die', sides: 8 });

    fireEvent.click(within(tray()).getByRole('button', { name: /^Colour:/ }));
    fireEvent.click(within(tray()).getByRole('button', { name: 'Gold' }));
    expect(writes.count).toBe(3);
    expect(stored().advantage).toEqual({ kind: 'die', sides: 8, colour: '#ca8a04' });

    fireEvent.click(within(tray()).getByRole('button', { name: 'Remove: advantage rolls no die' }));
    expect(writes.count).toBe(4);
    expect(stored()).not.toHaveProperty('advantage');
    expect(within(tray()).queryByRole('button', { name: /^Advantage die/ })).toBeNull();
    // The set's own dice were never touched.
    expect(stored().dice).toEqual([{ count: 1, sides: 20 }]);
  });
});
