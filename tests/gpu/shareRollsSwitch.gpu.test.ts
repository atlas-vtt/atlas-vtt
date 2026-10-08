import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceSettingsPanel } from '../../src/app/react/components/command-palette/DiceSettingsPanel';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceTool } from '../../src/app/tools/DiceTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const context = vi.hoisted(() => ({ app: null as unknown }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ app: context.app, view: { getViewType: () => 'atlas-vtt' } }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: { isPlayerView: boolean }) => unknown) => selector({ isPlayerView: false }),
}));
vi.mock('../../src/app/react/hooks/useDicePreviews', () => ({ useDicePreviews: () => ({}) }));

/** The dice tray and the dice settings page with the "Show my rolls to players" switch, styled by the real stylesheet. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
  button { height: 30px; }
`;
const h = React.createElement;
const diceTool = { rollDice: () => true } as unknown as DiceTool;

describe('the show my rolls to players switch', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(900, 700);
    document.head.append(style);
    const { app } = createInMemoryApp({ files: {} });
    context.app = app;
    new SettingsService(app);
    render(h('div', { className: 'atlas-vtt-plugin' },
      h(TooltipProvider, null,
        h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { position: 'fixed', left: 300, bottom: 20 } },
          h('div', { className: 'relative flex items-center' },
            h('button', { type: 'button' }, 'Dice'),
            h(DiceDropdownMenu, { diceTool, isOpen: true, onToggle: () => undefined }))),
        h('div', { className: 'atlas-command-palette-container atlas-command-palette-container--expanded', style: { position: 'fixed', left: 20, top: 20, width: 760 } },
          h(DiceSettingsPanel)))));
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const rect = (element: Element): DOMRect => element.getBoundingClientRect();

  it('sits in the tray across its content, between the formula and the Roll button', () => {
    const tray = document.querySelector('.atlas-dice-tray__content')!;
    const row = tray.querySelector('.atlas-dropdown-toggle-row')!;
    const toggle = row.querySelector('.atlas-toggle')!;
    const formula = rect(tray.querySelector('.atlas-dice-tray__formula')!);
    const roll = rect(tray.querySelector('.atlas-dice-tray__roll')!);
    const content = rect(tray);
    const box = rect(row);

    expect(box.left).toBeCloseTo(content.left, 0);
    expect(box.right).toBeCloseTo(content.right, 0);
    expect(box.top).toBeGreaterThan(formula.bottom);
    expect(box.bottom).toBeLessThan(roll.top);
    expect(rect(toggle).right).toBeCloseTo(content.right, 0);
    // The toolbar's blanket button rules must not reach the switch.
    expect(getComputedStyle(toggle).height).toBe(getComputedStyle(document.querySelector('.atlas-command-palette-container .atlas-toggle')!).height);
    expect(row.querySelector('.atlas-dropdown-toggle-row__label')!.textContent).toBe('Show my rolls to players');

  });

  it('stands in the Rolls column of the dice settings page', () => {
    const panel = document.querySelector('.atlas-command-palette-container')!;
    const toggle = panel.querySelector('[role="switch"]')!;
    const column = toggle.closest('.atlas-command-palette-panel-column')!;
    expect(column.querySelector('.atlas-command-palette-panel-heading')!.textContent).toBe('Rolls');
    expect(rect(toggle).right).toBeLessThanOrEqual(rect(column).right + 0.5);
  });
});
