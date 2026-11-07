import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import paneCss from '../../src/app/statblocks/editor/statblock-pane/statblock-pane.scss?inline';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { CountersGrid } from '../../src/app/statblocks/render/shared/CountersGrid';
import { ValueEditingContext, type ValueEditing } from '../../src/app/statblocks/render/valueSlot';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import { CounterResetPicker } from '../../src/app/statblocks/editor/statblock-pane/CounterResetPicker';
import { PaneRecoveryButtons } from '../../src/app/statblocks/editor/statblock-pane/PaneRecovery';
import { PaneEditContext, type PaneEditController } from '../../src/app/statblocks/editor/statblock-pane/paneEditContext';
import type { PaneRecovery } from '../../src/app/statblocks/editor/statblock-pane/usePaneRecovery';
import type { TokenAsset } from '../../src/app/services/AssetService';

// Nothing here rests or rolls: the buttons are drawn as the pane draws them.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/recovery/takeRest', () => ({ takeRest: vi.fn() }));
vi.mock('../../src/app/recovery/characterRest', () => ({ characterRestOf: vi.fn(), characterRest: vi.fn(() => null) }));
vi.mock('../../src/app/services/statblockRolls', () => ({ rollStatblockDice: vi.fn() }));

const THEME = `body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-ui-smaller: 12px;
  --font-ui-small: 13px; --font-ui-large: 20px; --font-semibold: 600; --font-bold: 700; --line-height-tight: 1.2; --radius-s: 4px;
  --radius-m: 8px; --text-accent: rgb(120, 80, 200); --text-muted: rgb(90, 90, 90); --text-faint: rgb(150, 150, 150);
  --background-modifier-border: rgb(120, 120, 120); }`;

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'recovery-abc123',
  fields: [{ key: 'uses', label: 'Uses', type: 'counters' }],
  layout: { maxColumns: 1, blocks: [{ id: 'uses0001', type: 'counters', field: 'uses' }] },
};

const BUTTONS = [
  { id: 'short', name: 'Short rest', rules: [] },
  { id: 'long', name: 'Long rest', rules: [{ target: { kind: 'resource', field: 'hp' }, does: 'spend', from: { kind: 'resource', field: 'hitDice' }, each: '1d8' }] },
] as const;

const RECOVERY = {
  character: { id: 'mira', name: 'Mira' } as TokenAsset,
  several: false,
  templateId: TEMPLATE.id,
  template: TEMPLATE,
  buttons: BUTTONS,
} as unknown as PaneRecovery;

const USES = [{ name: 'Wand', max: 3, used: 1, reset: 'long' }, { name: 'Ki', max: 2, used: 0 }];

const EDITING: ValueEditing = {
  slot: (_block, values) => values,
  counters: (_block, shown) => React.createElement(CountersGrid, {
    ...shown,
    controls: {
      use: () => undefined,
      after: ({ row }) => React.createElement(CounterResetPicker, { row, buttons: RECOVERY.buttons, disabled: false, onPick: () => undefined }),
    },
  }),
  recovery: () => React.createElement(PaneRecoveryButtons, { recovery: RECOVERY }),
};

function mount(): void {
  const pane = { writable: true } as PaneEditController;
  const sheet = React.createElement(StatblockSheet, { template: TEMPLATE, name: 'Mira', fields: { name: 'Mira', uses: USES }, variant: 'feed' });
  const card = React.createElement(PaneEditContext.Provider, { value: pane }, React.createElement(ValueEditingContext.Provider, { value: EDITING }, sheet));
  render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380, padding: 16 } }, card));
}

const rectOf = (selector: string, within: ParentNode = document): DOMRect => within.querySelector<HTMLElement>(selector)!.getBoundingClientRect();

/** A player character's recovery buttons and its counters' rests, in the real stylesheets. */
describe('Recovery actions in the note panel', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css + paneCss;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('stands as one row of capsules between the header and the blocks, named as the character\'s', () => {
    mount();
    const group = document.querySelector<HTMLElement>('.atlas-sb-recovery')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Recovery of Mira');
    const buttons = [...group.querySelectorAll<HTMLElement>('.atlas-sb-recovery__button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Short rest', 'Long rest']);
    const [first, second] = buttons.map((button) => button.getBoundingClientRect());
    expect(first!.height).toBeCloseTo(24, 0);
    expect(Math.abs(first!.top - second!.top)).toBeLessThan(1);
    expect(second!.left - first!.right).toBeCloseTo(8, 0);
    expect(getComputedStyle(buttons[0]!).borderTopLeftRadius).toBe('9999px');
    expect(rectOf('.atlas-sb-columns').top - group.getBoundingClientRect().bottom).toBeCloseTo(8, 0);
  });

  it('sets its glyph in the capsule\'s curve, in the accent, and keeps its text clear of the other end', () => {
    mount();
    const button = document.querySelector<HTMLElement>('.atlas-sb-recovery__button')!;
    const box = button.getBoundingClientRect();
    const glyph = button.querySelector('svg')!;
    expect(glyph.getBoundingClientRect().left - box.left).toBeCloseTo(9, 0);
    expect(glyph.getBoundingClientRect().width).toBeCloseTo(12, 0);
    expect(getComputedStyle(glyph).color).toBe('rgb(120, 80, 200)');
    const text = document.createRange();
    text.selectNodeContents(button.lastChild!);
    expect(box.right - text.getBoundingClientRect().right).toBeCloseTo(13, 0);
  });

  it('names under each row of counters the rest that gives its uses back, flush with the row\'s name', () => {
    mount();
    const [wand, ki] = [...document.querySelectorAll<HTMLElement>('.atlas-sb-counter')];
    const wandReset = wand!.querySelector<HTMLElement>('.atlas-sb-counter__reset')!;
    expect(wandReset.textContent).toBe('Long rest');
    expect(wandReset.classList.contains('is-set')).toBe(true);
    expect(ki!.querySelector('.atlas-sb-counter__reset')!.textContent).toBe('');
    const name = rectOf('.atlas-sb-counter__name', wand);
    const glyph = wandReset.querySelector('svg')!.getBoundingClientRect();
    expect(glyph.left - name.left).toBeCloseTo(0, 0);
    expect(glyph.top).toBeGreaterThan(rectOf('.atlas-sb-counter__pips', wand).bottom - 1);
  });
});
