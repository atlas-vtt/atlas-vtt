import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { blockEl, fakeApp, renderSheet, templateOf } from './sheetTestKit';

vi.mock('../../../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

afterEach(cleanup);

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'proficiency', label: 'Proficiency', type: 'number' },
  { key: 'attack', label: 'Attack', type: 'text' },
  { key: 'experiences', label: 'Experiences', type: 'pairs' },
  { key: 'evasion', label: 'Evasion', type: 'number' },
  { key: 'agility', label: 'Agility', type: 'number' },
  { key: 'motto', label: 'Motto', type: 'text' },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'prof0001', type: 'stat', field: 'proficiency', look: 'run-in', addsToRolls: true },
  { id: 'attack01', type: 'stat', field: 'attack', look: 'run-in' },
  { id: 'exper001', type: 'pairs', field: 'experiences', display: 'signed', addsToRolls: true },
  { id: 'metric01', type: 'metric', heading: 'Traits', fields: ['evasion', 'agility'], addsToRolls: true },
  { id: 'motto001', type: 'stat', field: 'motto', look: 'run-in', addsToRolls: true },
];
const TEMPLATE = templateOf(FIELDS, BLOCKS);
const VALUES = {
  name: 'Mira', proficiency: 2, attack: 'Bow +5', experiences: [{ Survival: 2 }, { Stealth: 1 }], evasion: 10, agility: 1, motto: '3',
};

function attackLink(container: HTMLElement): HTMLElement {
  return blockEl(container, 'attack01')!.querySelector<HTMLElement>('.atlas-dice-link')!;
}

describe('values that add to rolls', () => {
  it('get a switch after each whole number, named by the value\'s label or the pair\'s name', () => {
    renderSheet(TEMPLATE, VALUES, { app: fakeApp(), sourcePath: 'Mira.md' });
    const names = screen.getAllByRole('switch').map((toggle) => toggle.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id!)?.textContent);
    expect(names).toEqual([
      'Add Proficiency to the next roll', 'Add Survival to the next roll', 'Add Stealth to the next roll',
      'Add Evasion to the next roll', 'Add Agility to the next roll',
    ]);
    for (const toggle of screen.getAllByRole('switch')) expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('get none where the value is no whole number or the block does not add to rolls', () => {
    const { container } = renderSheet(TEMPLATE, { ...VALUES, proficiency: 2.5, experiences: [{ Survival: 'many' }] }, { app: fakeApp(), sourcePath: 'Mira.md' });
    expect(blockEl(container, 'prof0001')!.querySelector('[role="switch"]')).toBeNull();
    expect(blockEl(container, 'exper001')!.querySelector('[role="switch"]')).toBeNull();
    // A text value never adds to rolls, though it reads as a number.
    expect(blockEl(container, 'motto001')!.querySelector('[role="switch"]')).toBeNull();
    cleanup();
    // A card that cannot roll draws them inert.
    const { container: plain } = renderSheet(TEMPLATE, VALUES);
    expect(plain.querySelectorAll('.atlas-sb-arm[inert]')).toHaveLength(5);
    expect(plain.querySelectorAll('.atlas-sb-arm:not([inert])')).toHaveLength(0);
  });

  it('are armed in every view of the note at once, and the next roll adds them as terms and switches them off', () => {
    const rolls: Array<{ formula: string; source: unknown }> = [];
    const app = fakeApp(rolls);
    const first = renderSheet(TEMPLATE, VALUES, { app, sourcePath: 'Mira.md' }).container;
    const second = render(<StatblockSheet template={TEMPLATE} fields={VALUES} name="Test template" variant="hover" app={app} sourcePath="Mira.md" />).container;
    const other = render(<StatblockSheet template={TEMPLATE} fields={VALUES} name="Test template" variant="hover" app={app} sourcePath="Goblin.md" />).container;
    const toggles = (root: HTMLElement): string[] => [...root.querySelectorAll('[role="switch"]')].map((toggle) => toggle.getAttribute('aria-checked') ?? '');

    act(() => { fireEvent.click(first.querySelectorAll<HTMLElement>('[role="switch"]')[0]!); });
    act(() => { fireEvent.keyDown(second.querySelectorAll<HTMLElement>('[role="switch"]')[2]!, { key: ' ' }); });
    expect(toggles(first)).toEqual(['true', 'false', 'true', 'false', 'false']);
    expect(toggles(second)).toEqual(toggles(first));
    expect(toggles(other)).toEqual(['false', 'false', 'false', 'false', 'false']);

    act(() => { attackLink(second).click(); });
    expect(rolls.map((roll) => roll.formula)).toEqual(['+5+2[Proficiency]+1[Stealth]']);
    expect(toggles(first)).toEqual(['false', 'false', 'false', 'false', 'false']);
    expect(toggles(second)).toEqual(toggles(first));

    act(() => { attackLink(first).click(); });
    expect(rolls.map((roll) => roll.formula).at(-1)).toBe('+5');
  });

  it('never roll anything when armed or disarmed', () => {
    const rolls: Array<{ formula: string; source: unknown }> = [];
    renderSheet(TEMPLATE, VALUES, { app: fakeApp(rolls), sourcePath: 'Mira.md' });
    const toggle = screen.getAllByRole('switch')[3]!;
    act(() => { fireEvent.click(toggle); });
    act(() => { fireEvent.keyDown(toggle, { key: 'Enter' }); });
    expect(rolls).toEqual([]);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('add the number the card shows now, where it changed while armed', () => {
    const rolls: Array<{ formula: string; source: unknown }> = [];
    const app = fakeApp(rolls);
    const { container, rerender } = renderSheet(TEMPLATE, VALUES, { app, sourcePath: 'Changed.md' });
    act(() => { fireEvent.click(screen.getAllByRole('switch')[0]!); });
    rerender(<StatblockSheet template={TEMPLATE} fields={{ ...VALUES, proficiency: 3 }} name="Test template" variant="full" app={app} sourcePath="Changed.md" />);
    act(() => { attackLink(container).click(); });
    expect(rolls.map((roll) => roll.formula)).toEqual(['+5+3[Proficiency]']);
  });

  it('are drawn inert where the card previews its template (the template editor), and arm nothing there', () => {
    const { container } = render(
      <StatblockSheet template={TEMPLATE} fields={VALUES} name="Test template" variant="full" mode="editing" app={fakeApp()} sourcePath="Inert.md" rollBonuses="preview" />,
    );
    expect(container.querySelectorAll('.atlas-sb-arm:not([inert])')).toHaveLength(0);
    const drawn = blockEl(container, 'prof0001')!.querySelector<HTMLElement>('.atlas-sb-arm')!;
    expect(drawn.hasAttribute('inert')).toBe(true);
    const toggle = within(drawn).getByRole('switch');
    act(() => { fireEvent.click(toggle); });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('roll as a bonus too, where the block does both, and are not added twice when their own number is rolled', () => {
    const rolls: Array<{ formula: string; source: unknown }> = [];
    const both = templateOf(FIELDS, BLOCKS.map((block) => (block.type === 'stat' || block.type === 'pairs' ? { ...block, rollable: true } : block)));
    const { container } = renderSheet(both, VALUES, { app: fakeApp(rolls), sourcePath: 'Both.md' });
    const proficiency = blockEl(container, 'prof0001')!;
    const [armProficiency, , armStealth] = screen.getAllByRole('switch');
    act(() => { fireEvent.click(armProficiency!); });
    act(() => { fireEvent.click(armStealth!); });
    act(() => { proficiency.querySelector<HTMLElement>('.atlas-dice-link')!.click(); });
    expect(rolls.map((roll) => roll.formula)).toEqual(['+2+1[Stealth]']);
    expect(screen.getAllByRole('switch').map((toggle) => toggle.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'false']);
    const survival = blockEl(container, 'exper001')!.querySelector<HTMLElement>('[data-roll-name="Survival"] .atlas-dice-link')!;
    act(() => { survival.click(); });
    expect(rolls.at(-1)?.formula).toBe('+2');
  });
});
