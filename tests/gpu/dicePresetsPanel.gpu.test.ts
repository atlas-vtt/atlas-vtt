import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DicePresetsPanel } from '../../src/app/react/components/dice/DicePresetsPanel';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { readDiceShelf, STANDARD_ROW } from '../../src/app/react/components/dice/diceShelf';

/** The saved rolls beside the tray, with the real stylesheet: beside it, foot on its foot, and a longer row in one line. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --background-modifier-form-field: #2a2a2a;
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --text-accent: #a68af9; --text-error: #fb464c; --interactive-accent: #7f6df2;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px;
    --font-ui-large: 20px; --input-height: 30px; --mono-100: #fff; }
`;
const h = React.createElement;
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const shelf = readDiceShelf({
  dicePresets: [
    { id: 'a', name: 'Duality', formula: '2d12' },
    { id: 'b', name: 'Longsword', formula: '1d8+3[slashing]' },
    { id: 'c', name: 'Stat line', formula: '4d6kh3' },
  ],
  diceRow: [...STANDARD_ROW.slice(0, 6), { kind: 'preset', id: 'a' }, { kind: 'die', sides: 3 }, { kind: 'preset', id: 'b' }],
});

function Scene(): React.ReactElement {
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: 760 } },
    h('div', { className: 'atlas-dice-tray', style: { left: '70%', bottom: 20, top: 'auto' } },
      h(DicePresetsPanel, { shelf, onChange: () => undefined, trayFormula: '2d12 + 3', problemOf: () => null, onRoll: () => undefined }),
      h('div', { className: 'atlas-dice-panel' },
        h(DiceTray, {
          memory: { formula: '2d12 + 3', side: 'normal' }, onRemember: () => undefined, check: () => null, onRoll: () => true, history: [],
          onRepeat: () => true, historyOpen: false, onHistoryOpen: () => undefined, onClose: () => undefined,
          shelf, presetsPanel: { open: true, onToggle: () => undefined },
        })))));
}

const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();

describe('the saved rolls beside the dice tray', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1280, 800);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('stands left of the tray, its foot on the tray\'s foot, and the row holds nine places in one line', async () => {
    render(h(Scene));
    await settle();
    const panel = rect('.atlas-dice-presets');
    const tray = rect('.atlas-dice-tray > .atlas-dice-panel:not(.atlas-dice-presets)');
    expect(panel.right).toBeLessThanOrEqual(tray.left);
    expect(Math.abs(panel.bottom - tray.bottom)).toBeLessThan(1);
    const faces = [...document.querySelectorAll('.atlas-dice-tray__face')].map((face) => face.getBoundingClientRect());
    expect(faces).toHaveLength(9);
    expect(new Set(faces.map((face) => Math.round(face.top))).size).toBe(1);
    expect(faces.at(-1)!.right).toBeLessThanOrEqual(tray.right);
  });
});
