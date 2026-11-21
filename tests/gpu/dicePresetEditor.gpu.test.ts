import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DicePresetEditor } from '../../src/app/react/components/dice/DicePresetEditor';
import { DicePresetsPanel } from '../../src/app/react/components/dice/DicePresetsPanel';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { readDiceShelf, withPresetReplaced } from '../../src/app/react/components/dice/diceShelf';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { DicePreset } from '../../src/app/types/dicePresetTypes';
import { centreOf, mouse } from './realMouse';

/** A saved roll's editor beside the saved rolls, with the real stylesheet and the dice drawn by the dice renderer. */
const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; background: #c8c0a8; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --background-modifier-form-field: #2a2a2a;
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --text-accent: #a68af9; --text-error: #fb464c;
    --interactive-accent: #7f6df2; --radius-m: 8px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px;
    --input-height: 30px; --mono-100: #fff;
    --shadow-l: 0px 1.8px 7.3px rgba(0, 0, 0, 0.071), 0px 6.3px 24.7px rgba(0, 0, 0, 0.112), 0px 30px 90px rgba(0, 0, 0, 0.2); }
`;
const h = React.createElement;
const settle = (ms = 600): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const sword: DicePreset = {
  id: 'a', name: 'Longsword', formula: '+3',
  look: { dice: [{ count: 1, sides: 8, name: 'Slashing', colour: '#b91c1c' }, { count: 1, sides: 6, name: 'Fire', colour: '#ea580c' }], crit: 'natural' },
};

let stored: Pick<CollectionSettings, 'dicePresets' | 'diceRow'> = {};

/** Nothing of the tray or the saved rolls lies over `panel`, wherever it hangs. */
function expectUncovered(panel: HTMLElement): void {
  const box = panel.getBoundingClientRect();
  for (let x = box.left + 12; x < box.right - 12; x += 24) {
    for (let y = box.top + 12; y < box.bottom - 12; y += 24) {
      const hit = document.elementFromPoint(x, y);
      expect(panel.contains(hit), `${x}, ${y}: ${hit?.className}`).toBe(true);
    }
  }
}

function Scene({ trayLeft = '78%' }: { trayLeft?: string }): React.ReactElement {
  const [settings, setSettings] = useState(stored);
  const shelf = readDiceShelf(settings);
  const editing = shelf.presets[0]!;
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: 760 } },
    h('div', { className: 'atlas-dice-tray', style: { left: trayLeft, bottom: 20, top: 'auto' } },
      h(DicePresetsPanel, {
        shelf, onChange: () => undefined, trayFormula: '', problemOf: () => null, onRoll: () => undefined, onEdit: () => undefined, sets: [],
        editingId: editing.id,
      }, h(DicePresetEditor, {
        preset: editing,
        onSave: (preset: DicePreset) => {
          stored = { ...stored, ...withPresetReplaced(shelf, preset) };
          setSettings(stored);
        },
        onClose: () => undefined,
      })),
      h('div', { className: 'atlas-dice-panel' },
        h(DiceTray, {
          memory: { formula: '', side: 'normal' }, onRemember: () => undefined, check: () => null, onRoll: () => true, history: [],
          onRepeat: () => true, historyOpen: false, onHistoryOpen: () => undefined, onClose: () => undefined, shelf,
          presetsPanel: { open: true, onToggle: () => undefined },
        })))));
}

describe('a saved roll\'s editor', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    stored = { dicePresets: [sword], diceRow: [{ kind: 'die', sides: 20 }, { kind: 'preset', id: 'a' }] };
    await page.viewport(1600, 800);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('floats above the saved rolls, centred on them, with the dice drawn in their colours, and a die\'s fan changes its colour', async () => {
    render(h(Scene));
    await settle(1500);
    await Promise.all(document.querySelector('.atlas-dice-preset-editor')!.getAnimations().map((animation) => animation.finished));
    const editor = document.querySelector('.atlas-dice-preset-editor')!.getBoundingClientRect();
    const column = document.querySelector('.atlas-dice-presets')!.getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('.atlas-dice-preset-editor')!);
    // Above the saved rolls, centred on them: it needs no room beside the tray, and fits above a tray in a window of 800 px.
    expect(document.querySelector('.atlas-dice-preset-editor')!.classList.contains('atlas-keep-in-view--capped')).toBe(false);
    expect(editor.bottom).toBeLessThanOrEqual(column.top);
    expect(Math.abs((editor.left + editor.right) / 2 - (column.left + column.right) / 2)).toBeLessThan(1);
    expect(document.querySelectorAll('.atlas-dice-preset-editor .atlas-dice-lab__die')).toHaveLength(2);
    // The roll being edited stays lit in the list; the dice lie on the card, with no felt under them.
    expect(document.querySelector('.atlas-dice-presets__item')!.hasAttribute('data-editing')).toBe(true);
    expect(getComputedStyle(document.querySelector('.atlas-dice-preset-editor .atlas-dice-lab__field')!).backgroundImage).toBe('none');
    // The bonus and the rules' switch share one row.
    const bonus = document.querySelector('.atlas-dice-preset-editor__bonus')!.getBoundingClientRect();
    const rulesSwitch = document.querySelector('.atlas-dice-preset-editor__rules-toggle')!.getBoundingClientRect();
    expect(Math.abs(bonus.top - rulesSwitch.top)).toBeLessThan(1);
    expect(rulesSwitch.left).toBeGreaterThan(bonus.right);
    // With the rules folded the row is the card's foot: as far from its bottom as from its sides, so its corners
    // are concentric with the card's.
    const border = parseFloat(cs.borderLeftWidth);
    expect(Math.abs((editor.bottom - bonus.bottom) - (bonus.left - editor.left))).toBeLessThan(1);
    expect(Math.abs((editor.right - rulesSwitch.right) - (bonus.left - editor.left))).toBeLessThan(1);
    expect(bonus.left - editor.left - border).toBeCloseTo(parseFloat(cs.paddingLeft), 0);

    // Done is a control of its own: under the pointer it alone lights up, not the name's field.
    const head = document.querySelector('.atlas-dice-preset-editor__head')!;
    const resting = getComputedStyle(head).backgroundColor;
    const done = centreOf(document.querySelector('.atlas-dice-preset-editor__done')!);
    await mouse.hover(done.x, done.y);
    await settle(300);
    expect(getComputedStyle(head).backgroundColor).toBe(resting);
    expect(getComputedStyle(document.querySelector('.atlas-dice-preset-editor__done')!).backgroundColor).not.toBe(resting);
    const name = document.querySelector('.atlas-dice-preset-editor__name')!.getBoundingClientRect();
    await mouse.hover(name.left + 20, (name.top + name.bottom) / 2);
    await settle(300);
    expect(getComputedStyle(head).backgroundColor).not.toBe(resting);

    const die = centreOf(document.querySelector('.atlas-dice-preset-editor .atlas-dice-lab__die')!);
    await mouse.click(die.x, die.y);
    await settle();
    // A step of the die's fan (its sides) opens whole, past the card where the card is too small, never cut off.
    const sidesStep = centreOf(document.querySelector('.atlas-dice-preset-editor .atlas-dice-lab__fan-sides')!.closest('button')!);
    await mouse.click(sidesStep.x, sidesStep.y);
    await settle(400);
    const stepPanel = document.querySelector<HTMLElement>('.atlas-dice-preset-editor .atlas-dice-lab__step-panel')!;
    const panelBox = stepPanel.getBoundingClientRect();
    expect(stepPanel.scrollHeight).toBeLessThanOrEqual(stepPanel.clientHeight);
    expect(panelBox.top).toBeGreaterThanOrEqual(0);
    expect(panelBox.bottom).toBeLessThanOrEqual(window.innerHeight);
    expectUncovered(stepPanel);
    await mouse.click(sidesStep.x, sidesStep.y);
    await settle(400);

    const toggle = document.querySelector('.atlas-dice-preset-editor__rules-toggle')!;
    toggle.scrollIntoView({ block: 'nearest' });
    const rules = centreOf(toggle);
    await mouse.click(rules.x, rules.y);
    await settle();
    const choice = document.querySelector('.atlas-dice-preset-editor__rules .atlas-obsidian-menu-dropdown')!;
    choice.scrollIntoView({ block: 'nearest' });
    await settle(300);
    const critical = centreOf(choice);
    await mouse.click(critical.x, critical.y);
    await settle(400);
    // The Dice Lab's own choice opens its menu over the editor.
    expect(document.querySelector('.atlas-ctx-menu')).not.toBeNull();
  });

  it('stays inside a small window: moved back off its side, its height capped to the room above, where it scrolls', async () => {
    await page.viewport(560, 640);
    render(h(Scene));
    await settle(1500);
    const card = document.querySelector<HTMLElement>('.atlas-dice-preset-editor')!;
    await Promise.all(card.getAnimations().map((animation) => animation.finished));
    const editor = card.getBoundingClientRect();
    expect(editor.left).toBeGreaterThanOrEqual(0);
    expect(editor.right).toBeLessThanOrEqual(560);
    expect(editor.top).toBeGreaterThanOrEqual(0);
  });

  it('lies over the tray\'s own dice where a die\'s step panel hangs over the tray', async () => {
    // The saved rolls near the window's left edge: the editor is moved back to the right, over the tray.
    render(h(Scene, { trayLeft: '330px' }));
    await settle(1500);
    const card = document.querySelector<HTMLElement>('.atlas-dice-preset-editor')!;
    await Promise.all(card.getAnimations().map((animation) => animation.finished));
    const dice = card.querySelectorAll('.atlas-dice-lab__die');
    const die = centreOf(dice[dice.length - 1]!);
    await mouse.click(die.x, die.y);
    await settle();
    const sidesStep = centreOf(card.querySelector('.atlas-dice-lab__fan-sides')!.closest('button')!);
    await mouse.click(sidesStep.x, sidesStep.y);
    await settle(400);
    const panel = card.querySelector<HTMLElement>('.atlas-dice-lab__step-panel')!.getBoundingClientRect();
    expect(panel.right).toBeGreaterThan(document.querySelector('.atlas-dice-panel')!.getBoundingClientRect().left + 24);
    expectUncovered(card.querySelector<HTMLElement>('.atlas-dice-lab__step-panel')!);
  });
});
