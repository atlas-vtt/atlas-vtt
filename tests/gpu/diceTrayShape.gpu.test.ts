import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

/** The dice tray as the toolbar shows it, styled by the plugin's real stylesheet. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
  button { height: 30px; }
`;
const h = React.createElement;

describe('the dice tray\'s secret roll switch', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let setAvailable: (available: boolean) => void;

  beforeEach(async () => {
    await page.viewport(600, 700);
    document.head.append(style);
    // The wrappers are the ones DiceDropdownMenu puts around the tray.
    const tree = (secretRollAvailable: boolean): React.ReactElement => h('div', { className: 'atlas-vtt-plugin' },
      h('div', { className: 'atlas-vtt-toolbar', style: { position: 'fixed', left: 40, bottom: 60 } },
        h(TooltipProvider, null,
          h('div', { className: 'atlas-dice-tray' },
            h('div', { className: 'atlas-dice-panel' },
              h(DiceTray, { onRoll: () => undefined, secretRoll: true, onSecretRollChange: () => undefined, secretRollAvailable }))))));
    const { rerender } = render(tree(true));
    setAvailable = (available) => rerender(tree(available));
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const box = (selector: string): number[] => {
    const { left, top, width, height } = document.querySelector(selector)!.getBoundingClientRect();
    return [left, top, width, height];
  };

  it('keeps the tray\'s size and the switch its place when Show dice rolls is switched off and on', () => {
    const shape = (): number[][] => [box('.atlas-dice-tray'), box('.atlas-dropdown-toggle-row'), box('.atlas-toggle'), box('.atlas-dice-tray__actions')];
    const enabled = shape();
    act(() => setAvailable(false));
    expect(shape()).toEqual(enabled);
    act(() => setAvailable(true));
    expect(shape()).toEqual(enabled);
  });
});
