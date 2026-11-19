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

const context = vi.hoisted(() => ({ app: null as unknown, diceLog: [] as unknown[] }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ app: context.app, view: { getViewType: () => 'atlas-vtt' } }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: { isPlayerView: boolean; diceLog: unknown[] }) => unknown) => selector({ isPlayerView: false, diceLog: context.diceLog }),
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
/** Ten earlier rolls in the dice log, newest first: more than the history's four rows hold. */
const LOG = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, timestamp: Date.now() - i * 60_000, formula: `${i + 1}d6`, rolls: [], modifiers: 0, total: 3 * (i + 1) }));
const rollDice = vi.fn(() => ({}));
const diceTool = {
  rollDice, rollingDice: () => ({ dice: [{ count: 1, sides: 20 }], crit: 'natural' }),
  checkRoll: () => null, tray: { formula: '', side: 'normal' }, rememberTray: () => undefined,
} as unknown as DiceTool;

describe('the show my rolls to players switch', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(900, 700);
    document.head.append(style);
    context.diceLog = LOG;
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

  it('holds the roll history and the share switch in one row on the text edge, under the entry, neither wrapped', () => {
    const tray = document.querySelector('.atlas-dice-tray__content')!;
    const content = rect(tray);
    const textEdge = 12;
    const bar = rect(tray.querySelector('.atlas-dice-tray__bar')!);
    const history = tray.querySelector('.atlas-dice-tray__history-toggle')!;
    const toggle = tray.querySelector('.atlas-dice-tray__share .atlas-toggle')!;
    expect(bar.top).toBeGreaterThan(rect(tray.querySelector('.atlas-dice-tray__entry')!).bottom);
    // As tall as the standard switch it holds (Atlas' one switch, never a smaller kind).
    expect(bar.height).toBeCloseTo(40, 0);
    expect(rect(toggle).height).toBeCloseTo(40, 0);
    // The toggle is a hover row from the 4 px inset; its words start on the text edge. The switch ends on it.
    expect(rect(history).left).toBeCloseTo(content.left, 0);
    expect(rect(history.querySelector('.atlas-dice-tray__history-title')!).left).toBeCloseTo(content.left + textEdge, 0);
    expect(rect(toggle).right).toBeCloseTo(content.right - textEdge, 0);
    // Nothing wraps or clips: the short label and the title stand on one line.
    for (const words of tray.querySelectorAll('.atlas-dice-tray__history-title, .atlas-dice-tray__share-label')) {
      expect(rect(words).height).toBeLessThan(20);
    }
    expect(tray.querySelector('.atlas-dice-tray__share-label')!.textContent).toBe('Show to players');
    // The switch is named whole.
    expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)!.textContent).toBe('Show my rolls to players');
  });

  it('sets its groups apart, its fields and steppers on the text edge, and its actions 40 px tall with Clear standing', () => {
    const tray = document.querySelector('.atlas-dice-tray__content')!;
    const content = rect(tray);
    const textEdge = 12;
    const dice = rect(tray.querySelector('.atlas-dice-tray__dice')!);
    // One rhythm: dice, the formula row, the side, the history and sharing row, the actions, each 20 px from the next
    // (the message line lies in the gap under the fields, out of the flow); every control but the dice 40 px tall.
    // (This tray's dice set has no advantage, so it shows no side.)
    const rows = ['.atlas-dice-tray__entry', '.atlas-dice-tray__advantage', '.atlas-dice-tray__bar', '.atlas-dice-tray__actions']
      .map((selector) => tray.querySelector(selector))
      .filter((row): row is Element => row !== null)
      .map(rect);
    let above = dice;
    for (const row of rows) {
      expect(row.top - above.bottom).toBeCloseTo(20, 0);
      expect(row.height).toBeCloseTo(40, 0);
      above = row;
    }
    // The formula and the modifier are one bar on the text edge: the formula on the left, the modifier's steps on the
    // right $surface-inset inside the bar's edge, concentric with its corner; the inputs draw no edge of their own.
    const barEl = tray.querySelector('.atlas-dice-tray__entry')!;
    const entryBar = rect(barEl);
    const field = rect(tray.querySelector('.atlas-dice-tray__formula')!);
    expect(entryBar.left).toBeCloseTo(content.left + textEdge, 0);
    expect(entryBar.right).toBeCloseTo(content.right - textEdge, 0);
    expect(field.left).toBeCloseTo(entryBar.left + 1, 0);
    expect(getComputedStyle(tray.querySelector('.atlas-dice-tray__formula')!).borderTopWidth).toBe('0px');
    expect(getComputedStyle(barEl).borderTopLeftRadius).toBe('10px');
    const steps = tray.querySelectorAll('.atlas-dice-tray__step');
    const lastStep = rect(steps[steps.length - 1]!);
    expect(entryBar.right - lastStep.right).toBeCloseTo(4, 0);
    expect(lastStep.top - entryBar.top).toBeCloseTo(4, 0);
    expect(getComputedStyle(steps[0]!).borderTopLeftRadius).toBe('6px');
    const roll = rect(tray.querySelector('.atlas-dice-tray__roll')!);
    const clear = rect(tray.querySelector('.atlas-dice-tray__clear')!);
    expect(roll.height).toBeCloseTo(40, 0);
    expect(clear.height).toBeCloseTo(40, 0);
    expect(roll.left).toBeCloseTo(content.left, 0);
    expect(clear.right).toBeCloseTo(content.right, 0);
    // Each die is named under it, 4 px below its button, one 16 px line; the outer dice stay concentric with the panel.
    const face = rect(tray.querySelector('.atlas-dice-tray__face')!);
    const caption = rect(tray.querySelector('.atlas-dice-tray__caption')!);
    expect(caption.top - face.bottom).toBeCloseTo(4, 0);
    expect(caption.height).toBeCloseTo(16, 0);
    expect(getComputedStyle(tray.querySelector('.atlas-dice-tray__face')!).borderTopLeftRadius).toBe('10px');
    // The dice font's 1 reads as l: the field is set in the interface font with tabular figures.
    expect(getComputedStyle(tray.querySelector('.atlas-dice-tray__formula')!).fontVariantNumeric).toContain('tabular-nums');
  });

  it('opens the roll history below its row as a list about four rows high that scrolls, each row rolling again', async () => {
    const tray = document.querySelector('.atlas-dice-tray__content')!;
    // The tray slides up as it opens: measure Roll once that has settled.
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
    const before = rect(tray.querySelector('.atlas-dice-tray__actions')!);
    (tray.querySelector('.atlas-dice-tray__history-toggle') as HTMLButtonElement).click();
    const list = tray.querySelector<HTMLElement>('.atlas-dice-tray__history')!;
    const reveal = tray.querySelector<HTMLElement>('.atlas-dice-tray__history-reveal')!;
    // It unfolds: wait until its rows have faded in and its height stopped growing.
    await vi.waitFor(() => {
      if (getComputedStyle(list).opacity !== '1' || Math.abs(rect(reveal).height - rect(list).height - 8) > 0.5) throw new Error('still unfolding');
    }, { timeout: 2000 });
    const firstRow = rect(list.querySelector('.atlas-dice-tray__history-row')!);
    expect(firstRow.top - rect(tray.querySelector('.atlas-dice-tray__bar')!).bottom).toBeCloseTo(8, 0);
    expect(rect(list).bottom).toBeLessThanOrEqual(rect(tray.querySelector('.atlas-dice-tray__actions')!).top);
    expect(list.clientHeight).toBeCloseTo(4 * 32, 0);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    list.scrollTop = list.scrollHeight;
    expect(list.scrollTop).toBeGreaterThan(0);
    // Roll stays at the foot and in view: the tray grows upward from it (a short view caps it, and its body scrolls).
    const after = rect(tray.querySelector('.atlas-dice-tray__actions')!);
    expect(Math.abs(after.bottom - before.bottom)).toBeLessThan(8);
    expect(after.bottom).toBeLessThanOrEqual(innerHeight);
    const last = list.querySelectorAll('.atlas-dice-tray__history-row');
    (last[last.length - 1] as HTMLElement).click();
    expect(rollDice).toHaveBeenLastCalledWith('10d6', undefined, undefined, undefined);
  });

  it('stands in the Rolls column of the dice settings page', () => {
    const panel = document.querySelector('.atlas-command-palette-container')!;
    const toggle = panel.querySelector('[role="switch"]')!;
    const column = toggle.closest('.atlas-command-palette-panel-column')!;
    expect(column.querySelector('.atlas-command-palette-panel-heading')!.textContent).toBe('Rolls');
    expect(rect(toggle).right).toBeLessThanOrEqual(rect(column).right + 0.5);
  });
});
