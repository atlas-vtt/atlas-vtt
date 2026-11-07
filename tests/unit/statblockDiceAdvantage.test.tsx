// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { attachDiceRolling, diceLinkProps, type RollChoice } from '../../src/app/services/statblockDiceLinks';
import { useStatblockDiceRolling } from '../../src/app/statblocks/render/shared/useStatblockDiceRolling';
import type { RollingDice } from '../../src/app/types/diceSetTypes';

afterEach(cleanup);

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;
const exploding = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d10-exploding')!;

/** An Obsidian app with one open map whose dice tool records every roll with its arguments. */
function mapApp(rules: RollingDice = d20) {
  const calls: unknown[][] = [];
  const diceTool = {
    rollDice: (...args: unknown[]) => { calls.push(args); return { formula: args[0] } as never; },
    rollingDice: () => rules,
  };
  const app = {
    workspace: { getLeavesOfType: () => [{ view: { serviceManager: { getToolController: () => ({ getDiceTool: () => diceTool }) } } }] },
    vault: { getFileByPath: () => null },
  } as never;
  return { app, calls };
}

function statblock(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

const link = (el: HTMLElement): HTMLElement => el.querySelector<HTMLElement>('.atlas-dice-link')!;

describe('rolling a statblock\'s roll with advantage', () => {
  it('rolls with advantage on Shift-click, disadvantage on Alt-click, and plainly with both or neither', () => {
    const { app, calls } = mapApp();
    const el = statblock('<span class="atlas-dice-link" data-formula="+4">+4</span>');
    const dispose = attachDiceRolling(el, app, () => ({}));
    fireEvent.click(link(el), { shiftKey: true });
    fireEvent.click(link(el), { altKey: true });
    fireEvent.click(link(el), { shiftKey: true, altKey: true });
    fireEvent.click(link(el));
    expect(calls.map((args) => args[3])).toEqual([{ advantage: 'advantage' }, { advantage: 'disadvantage' }, undefined, undefined]);
    expect(calls[2]).toHaveLength(2);
    fireEvent.keyDown(link(el), { key: 'Enter', shiftKey: true });
    expect(calls.at(-1)?.[3]).toEqual({ advantage: 'advantage' });
    dispose();
  });

  it('offers the sides the set has a rule for on a right-click, only for a roll of its dice', () => {
    const offered = (formula: string, rules: RollingDice): string[] => {
      const { app } = mapApp(rules);
      const el = statblock(`<span class="atlas-dice-link" data-formula="${formula}">${formula}</span>`);
      const openMenu = vi.fn<(choices: readonly RollChoice[]) => void>();
      const dispose = attachDiceRolling(el, app, () => ({}), undefined, undefined, openMenu);
      fireEvent.contextMenu(link(el), { button: 2, clientX: 40, clientY: 30 });
      dispose();
      return openMenu.mock.lastCall?.[0].map((choice) => choice.label) ?? [];
    };
    expect(offered('+4', d20)).toEqual(['Roll', 'Roll with advantage', 'Roll with disadvantage']);
    expect(offered('1d20+4', d20)).toEqual(['Roll', 'Roll with advantage', 'Roll with disadvantage']);
    expect(offered('2d8+3', d20)).toEqual(['Roll']);
    expect(offered('+4', exploding)).toEqual(['Roll']);
  });

  it('opens no menu on the hit point line, which rolls hit points', () => {
    const { app } = mapApp();
    const el = statblock('<p data-hit-points><span class="atlas-dice-link" data-formula="2d8+2">2d8+2</span></p>');
    const openMenu = vi.fn();
    const dispose = attachDiceRolling(el, app, () => ({}), vi.fn(), undefined, openMenu);
    fireEvent.contextMenu(link(el), { button: 2 });
    expect(openMenu).not.toHaveBeenCalled();
    dispose();
  });
});

function Sheet({ app }: { app: never }): React.ReactElement {
  const [ref, rollMenu] = useStatblockDiceRolling({ app, notePath: 'Wolf.md', tokens: [], name: 'Wolf' });
  return (
    <div ref={ref}>
      <span {...diceLinkProps('+4')}>+4</span>
      {rollMenu}
    </div>
  );
}

describe('the roll menu of a statblock', () => {
  it('opens in a menu of its own where no surface has one, and rolls the side chosen', () => {
    const { app, calls } = mapApp();
    render(<Sheet app={app} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roll +4' }), { button: 2, clientX: 20, clientY: 20 });
    expect(screen.getByRole('menuitem', { name: /^Roll$|^Roll\b(?! with)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Roll with disadvantage/ }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toEqual({ advantage: 'disadvantage' });
  });
});
