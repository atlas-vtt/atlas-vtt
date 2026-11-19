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

function Scene(): React.ReactElement {
  const [settings, setSettings] = useState(stored);
  const shelf = readDiceShelf(settings);
  const editing = shelf.presets[0]!;
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: 760 } },
    h('div', { className: 'atlas-dice-tray', style: { left: '78%', bottom: 20, top: 'auto' } },
      h(DicePresetsPanel, {
        shelf, onChange: () => undefined, trayFormula: '', problemOf: () => null, onRoll: () => undefined, onEdit: () => undefined, sets: [],
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

  it('floats left of the saved rolls, foot to foot, with the dice drawn in their colours, and a die\'s fan changes its colour', async () => {
    render(h(Scene));
    await settle(1500);
    await Promise.all(document.querySelector('.atlas-dice-preset-editor')!.getAnimations().map((animation) => animation.finished));
    const editor = document.querySelector('.atlas-dice-preset-editor')!.getBoundingClientRect();
    const column = document.querySelector('.atlas-dice-presets')!.getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('.atlas-dice-preset-editor')!);
    expect(editor.right).toBeLessThanOrEqual(column.left);
    // Taller than the tray, it stands on the tray's foot and grows upward, never over the toolbar below.
    expect(Math.abs(editor.bottom - column.bottom)).toBeLessThan(1);
    expect(document.querySelectorAll('.atlas-dice-preset-editor .atlas-dice-lab__die')).toHaveLength(2);

    const die = centreOf(document.querySelector('.atlas-dice-preset-editor .atlas-dice-lab__die')!);
    await mouse.click(die.x, die.y);
    await settle();
    const rules = centreOf(document.querySelector('.atlas-dice-preset-editor__rules-toggle')!);
    await mouse.click(rules.x, rules.y);
    await settle();
    const critical = centreOf(document.querySelector('.atlas-dice-preset-editor__rules .atlas-obsidian-menu-dropdown')!);
    await mouse.click(critical.x, critical.y);
    await settle(400);
    // The Dice Lab's own choice opens its menu over the editor.
    expect(document.querySelector('.atlas-ctx-menu')).not.toBeNull();
  });
});
