import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import type { DiceTool } from '../../src/app/tools/DiceTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The GM's "Show my rolls to players" switch reads the view's store, which these trays have none of; a remote view's tray never shows it.
vi.mock('../../src/app/react/hooks/useShareRolls', () => ({ useShareRolls: () => null }));

function openTray(props: { onRoll?: (dice: Readonly<Record<string, number>>, modifier: number) => string | null; maxDice?: number }): {
  rollDice: ReturnType<typeof vi.fn>; onToggle: ReturnType<typeof vi.fn>;
} {
  const { app } = createInMemoryApp();
  // A roll that was made: since #275 a refused formula returns null and keeps the tray open.
  const rollDice = vi.fn(() => ({ id: 'roll' }));
  const onToggle = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <DiceDropdownMenu diceTool={{ rollDice } as unknown as DiceTool} isOpen onToggle={onToggle} {...props} />
    </AtlasUIContext.Provider>,
  );
  return { rollDice, onToggle };
}

const pickD20 = (): void => { fireEvent.click(screen.getByLabelText(/^Add a d20/)); };

describe("the dice tray's roll may be refused", () => {
  it('shows why a roll could not go and keeps the tray open with its dice', async () => {
    const onRoll = vi.fn((): string | null => 'Not connected');
    const { rollDice, onToggle } = openTray({ onRoll, maxDice: 100 });
    pickD20();
    fireEvent.click(screen.getByText('Roll'));
    expect(onRoll).toHaveBeenCalledWith({ d20: 1 }, 0);
    expect(await screen.findByText('Not connected')).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
    expect(rollDice).not.toHaveBeenCalled();
    expect(screen.getByText('1d20')).toBeTruthy();
  });

  it('closes the tray and rolls nothing itself once the roll went elsewhere', () => {
    const onRoll = vi.fn((): string | null => null);
    const { rollDice, onToggle } = openTray({ onRoll });
    pickD20();
    fireEvent.click(screen.getByLabelText('Increase modifier'));
    fireEvent.click(screen.getByText('Roll'));
    expect(onRoll).toHaveBeenCalledWith({ d20: 1 }, 1);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(rollDice).not.toHaveBeenCalled();
  });

  it('rolls with its own dice tool when nothing takes the roll', () => {
    const { rollDice, onToggle } = openTray({});
    pickD20();
    fireEvent.click(screen.getByText('Roll'));
    expect(rollDice).toHaveBeenCalledWith('1d20');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('clears the note once the dice change', async () => {
    openTray({ onRoll: () => 'Not connected' });
    pickD20();
    fireEvent.click(screen.getByText('Roll'));
    expect(await screen.findByText('Not connected')).toBeTruthy();
    pickD20();
    expect(screen.queryByText('Not connected')).toBeNull();
  });

  it('keeps the tray limit when maxDice is not a number', () => {
    openTray({ maxDice: Number.NaN });
    for (const sides of [20, 12, 10, 8, 6]) {
      for (let i = 0; i < 20; i++) fireEvent.click(screen.getByLabelText(new RegExp(`^Add a d${sides}(,|$)`)));
    }
    expect((screen.getByLabelText('Add a d4') as HTMLButtonElement).disabled).toBe(true);
  });

  it('holds no more dice than maxDice', () => {
    openTray({ maxDice: 2 });
    pickD20();
    pickD20();
    expect((screen.getByLabelText(/^Add a d20/) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Add a d6') as HTMLButtonElement).disabled).toBe(true);
  });
});
