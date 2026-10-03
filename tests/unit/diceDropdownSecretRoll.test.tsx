import { act, fireEvent, render, screen } from '@testing-library/react';
import { EventEmitter } from 'events';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DiceTool, type DiceRollResult } from '../../src/app/tools/DiceTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const afterEachCleanup: Array<() => void> = [];
afterEach(() => {
  afterEachCleanup.splice(0).forEach((undo) => undo());
  vi.restoreAllMocks();
});

interface Tray {
  diceTool: DiceTool;
  settings: SettingsService;
  rolls: DiceRollResult[];
  onToggle: ReturnType<typeof vi.fn>;
  openTray: () => void;
}

/** A real tool in a real tray; `rolls` collects what the tray throws. */
function setup(): Tray {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  const diceTool = new DiceTool(new EventEmitter());
  const onToggle = vi.fn();
  const rolls: DiceRollResult[] = [];
  const listener = (event: Event): void => { rolls.push((event as CustomEvent<DiceRollResult>).detail); };
  document.addEventListener('atlas-dice-rolled', listener);
  afterEachCleanup.push(() => document.removeEventListener('atlas-dice-rolled', listener));

  const tree = (isOpen: boolean): React.ReactElement => (
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <DiceDropdownMenu diceTool={diceTool} isOpen={isOpen} onToggle={onToggle} />
    </AtlasUIContext.Provider>
  );
  const { rerender } = render(tree(true));
  return { diceTool, settings, rolls, onToggle, openTray: () => rerender(tree(true)) };
}

function throwOneDie(): void {
  fireEvent.click(screen.getByRole('button', { name: 'd20' }));
  fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
}

describe('rolling from the dice tray', () => {
  it('makes the roll secret while the secret roll switch is on', () => {
    const { diceTool, rolls } = setup();
    act(() => diceTool.setSecretRoll(true));
    throwOneDie();
    expect(rolls[0]?.secret).toBe(true);
  });

  it('leaves a roll without the secret flag while the switch is off', () => {
    const { rolls } = setup();
    throwOneDie();
    expect(rolls[0] && 'secret' in rolls[0]).toBe(false);
  });

  it('still stamps the roll secret while Show dice rolls is off, so the GM log shows the GM\'s intent', () => {
    const { diceTool, settings, rolls } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    act(() => diceTool.setSecretRoll(true));
    throwOneDie();
    expect(rolls[0]?.secret).toBe(true);
  });
});
