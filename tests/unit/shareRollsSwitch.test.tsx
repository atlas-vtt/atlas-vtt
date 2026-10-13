import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceSettingsPanel } from '../../src/app/react/components/command-palette/DiceSettingsPanel';
import type { DiceTool } from '../../src/app/tools/DiceTool';

const context = vi.hoisted(() => ({ app: {} as object, viewType: 'atlas-vtt', isPlayerView: false }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ app: context.app, view: { getViewType: () => context.viewType } }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: { isPlayerView: boolean }) => unknown) => selector({ isPlayerView: context.isPlayerView }),
}));
vi.mock('../../src/app/react/hooks/useDicePreviews', () => ({ useDicePreviews: () => ({}) }));
vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

const diceTool = { rollDice: vi.fn(() => true) } as unknown as DiceTool;
let settings: SettingsService;

beforeEach(() => {
  vi.useFakeTimers();
  context.app = {};
  context.viewType = 'atlas-vtt';
  context.isPlayerView = false;
  settings = new SettingsService(context.app as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderBoth(): { tray: HTMLElement; panel: HTMLElement } {
  render(
    <>
      <div data-testid="tray"><DiceDropdownMenu diceTool={diceTool} isOpen onToggle={() => undefined} /></div>
      <div data-testid="panel"><DiceSettingsPanel /></div>
    </>,
  );
  return { tray: screen.getByTestId('tray'), panel: screen.getByTestId('panel') };
}

const shareSwitch = (root: HTMLElement): HTMLElement => within(root).getByRole('switch', { name: 'Show my rolls to players' });

it('starts from the player view setting, off by default', () => {
  const { tray, panel } = renderBoth();
  expect(settings.getLocalPlayerViewSettings().showDiceRolls).toBe(false);
  expect(shareSwitch(tray).getAttribute('aria-checked')).toBe('false');
  expect(shareSwitch(panel).getAttribute('aria-checked')).toBe('false');
});

it('the tray switch writes the one setting, and the settings page follows', () => {
  const { tray, panel } = renderBoth();
  fireEvent.click(shareSwitch(tray));
  expect(settings.getLocalPlayerViewSettings().showDiceRolls).toBe(true);
  expect(shareSwitch(panel).getAttribute('aria-checked')).toBe('true');
  expect(shareSwitch(tray).getAttribute('aria-checked')).toBe('true');
});

it('the settings page switch writes the one setting, and the tray follows', () => {
  const { tray, panel } = renderBoth();
  fireEvent.click(shareSwitch(panel));
  expect(settings.getLocalPlayerViewSettings().showDiceRolls).toBe(true);
  expect(shareSwitch(tray).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(shareSwitch(panel));
  expect(settings.getLocalPlayerViewSettings().showDiceRolls).toBe(false);
  expect(shareSwitch(tray).getAttribute('aria-checked')).toBe('false');
});

it('follows the player view settings changed elsewhere', () => {
  const { tray, panel } = renderBoth();
  act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
  expect(shareSwitch(tray).getAttribute('aria-checked')).toBe('true');
  expect(shareSwitch(panel).getAttribute('aria-checked')).toBe('true');
});

it('offers no switch in a player view', () => {
  context.viewType = 'atlas-vtt-player';
  const { tray, panel } = renderBoth();
  expect(within(tray).queryByRole('switch')).toBeNull();
  expect(within(panel).queryByRole('switch', { name: 'Show my rolls to players' })).toBeNull();
});
