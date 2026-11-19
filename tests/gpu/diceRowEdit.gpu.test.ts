import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { readDiceShelf, type ShelfChange } from '../../src/app/react/components/dice/diceShelf';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { centreOf, mouse, pressAndMove } from './realMouse';

/** The dice row's edit mode with the real stylesheet and a real mouse: the dice wiggle, a drag reorders them. */
const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada;
    --text-muted: #b3b3b3; --text-faint: #777; --text-error: #fb464c; --interactive-accent: #7f6df2; --radius-m: 8px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --mono-100: #fff; }
`;
const h = React.createElement;
const settle = (ms = 300): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let stored: Pick<CollectionSettings, 'dicePresets' | 'diceRow'> = {};

function Scene(): React.ReactElement {
  const [settings, setSettings] = useState(stored);
  const onShelfChange = (change: ShelfChange): void => {
    stored = { ...settings, ...change };
    setSettings(stored);
  };
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { padding: 40 } },
    h('div', { className: 'atlas-dice-panel' },
      h(DiceTray, {
        memory: { formula: '', side: 'normal' }, onRemember: () => undefined, check: () => null, onRoll: () => true, history: [],
        onRepeat: () => true, historyOpen: false, onHistoryOpen: () => undefined, onClose: () => undefined,
        shelf: readDiceShelf(settings), onShelfChange,
      }))));
}

const places = (): string[] => [...document.querySelectorAll('.atlas-dice-tray__die .atlas-dice-tray__caption')].map((caption) => caption.textContent ?? '');

describe('the dice row\'s edit mode', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    stored = {};
    await page.viewport(900, 600);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('wiggles the dice, and a drag of the d100 to the front puts it first, saved once on release', async () => {
    render(h(Scene));
    const edit = centreOf(document.querySelector('[aria-label="Edit dice row"]')!);
    await mouse.click(edit.x, edit.y);
    await settle();
    const face = document.querySelector<HTMLElement>('.atlas-dice-tray__dice--editing .atlas-dice-tray__face')!;
    expect(getComputedStyle(face).animationName).toBe('atlas-dice-wiggle');
    expect(places()).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'Add']);

    const dice = document.querySelectorAll('.atlas-dice-tray__die');
    const to = centreOf(dice[0]!);
    await pressAndMove(centreOf(dice[6]!), to);
    await mouse.up(to.x, to.y);
    await settle();
    expect(places().slice(0, 3)).toEqual(['d100', 'd4', 'd6']);
    expect(stored.diceRow?.[0]).toEqual({ kind: 'die', sides: 100 });
  });

  it('wraps a ninth place into a second line and drags a die from the second line into the first', async () => {
    stored = { diceRow: [4, 6, 8, 10, 12, 20, 100, 3, 30].map((sides) => ({ kind: 'die' as const, sides })) };
    render(h(Scene));
    const edit = centreOf(document.querySelector('[aria-label="Edit dice row"]')!);
    await mouse.click(edit.x, edit.y);
    await settle();
    const dice = [...document.querySelectorAll('.atlas-dice-tray__dice--editing .atlas-dice-tray__die')];
    expect(new Set(dice.map((die) => Math.round(die.getBoundingClientRect().top))).size).toBe(2);
    const to = centreOf(dice[1]!);
    await pressAndMove(centreOf(dice[8]!), to);
    await mouse.up(to.x, to.y);
    await settle();
    expect(places().slice(0, 3)).toEqual(['d4', 'd30', 'd6']);
  });
});
