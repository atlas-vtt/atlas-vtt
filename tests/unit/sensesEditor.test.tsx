// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { newSense, withSenseKind } from '../../src/app/gameSystems/senseEditing';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import type { SenseRow } from '../../src/app/lighting/tokenLighting';
import { SensesEditor } from '../../src/app/react/components/senses/SensesEditor';
import type { SenseDefinition, TokenSense } from '../../src/app/types/senseTypes';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.senses!;
const pathfinder = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Pathfinder 2e')!.rules.senses!;
const byName = (definitions: readonly SenseDefinition[], name: string): SenseDefinition => definitions.find((sense) => sense.name === name)!;
const darkvision = senseWithRole(dnd5e, 'darkvision');
const tremorsense = senseWithRole(dnd5e, 'tremorsense');
const blindsight = byName(dnd5e, 'Blindsight');

interface HarnessProps {
  initial: SenseRow[] | null;
  definitions?: readonly SenseDefinition[];
  inherited?: TokenSense[];
  unit?: string;
}

function Harness({ initial, definitions = dnd5e, inherited, unit = 'ft' }: HarnessProps): React.ReactElement {
  const [senses, setSenses] = useState(initial);
  return (
    <>
      <SensesEditor senses={senses} onChange={setSenses} definitions={definitions} unit={unit} emptyText="No senses beyond sight." {...(inherited && { inheritedSenses: inherited })} />
      <output data-testid="senses">{JSON.stringify(senses)}</output>
    </>
  );
}

const saved = (): unknown => JSON.parse(screen.getByTestId('senses').textContent ?? 'null');
const rows = (): HTMLElement[] => screen.queryAllByRole('listitem');
const range = (name: string): HTMLInputElement => screen.getByLabelText(`${name} range`) as HTMLInputElement;

afterEach(cleanup);

describe('SensesEditor', () => {
  it('lists each sense with its range field, the map\'s unit and a way to remove it', () => {
    render(<Harness initial={[{ id: darkvision.id, range: '90' }, { id: tremorsense.id, range: '' }]} />);
    expect(rows().map((row) => within(row).getByText(/^(Darkvision|Tremorsense)$/).textContent)).toEqual(['Darkvision', 'Tremorsense']);
    expect(range('Darkvision').value).toBe('90');
    expect(range('Tremorsense').value).toBe('');
    expect(within(rows()[0]!).getByText('ft')).toBeTruthy();
    screen.getByRole('button', { name: 'Remove Darkvision' });
    expect(document.querySelector('[title]')).toBeNull();
  });

  it('shows the sense\'s default range as the placeholder, or that it is unlimited', () => {
    const optional: SenseDefinition = { ...newSense('home-1'), name: 'Keen eyes', range: 'optional' };
    const bare: SenseDefinition = { ...newSense('home-2'), name: 'Witch sight' };
    render(<Harness definitions={[darkvision, optional, bare]} initial={[darkvision, optional, bare].map(({ id }) => ({ id, range: '' }))} />);
    expect(range('Darkvision').placeholder).toBe(String(darkvision.defaultRange));
    expect(range('Keen eyes').placeholder).toBe('Unlimited');
    expect(range('Witch sight').placeholder).toBe('Range');
  });

  it('gives a sense without a range no field, and one that only lets sight see the invisible neither', () => {
    const lowLight = byName(pathfinder, 'Low-light vision');
    const seeUnseen = withSenseKind({ ...newSense('home-3'), name: 'See the unseen' }, 'see-invisible');
    render(<Harness definitions={[...pathfinder, seeUnseen]} initial={[{ id: lowLight.id, range: '' }, { id: seeUnseen.id, range: '' }]} />);
    expect(rows()).toHaveLength(2);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('keeps the field of an old distance on a sense that takes none, so it can be seen and cleared', () => {
    const pfDarkvision = senseWithRole(pathfinder, 'darkvision');
    render(<Harness definitions={pathfinder} initial={[{ id: pfDarkvision.id, range: '60' }]} />);
    expect(range('Darkvision').value).toBe('60');
    expect(range('Darkvision').placeholder).toBe('Unlimited');
  });

  it('edits a range and removes a sense', () => {
    render(<Harness initial={[{ id: darkvision.id, range: '60' }, { id: tremorsense.id, range: '' }]} />);
    fireEvent.change(range('Darkvision'), { target: { value: '120' } });
    expect(saved()).toEqual([{ id: darkvision.id, range: '120' }, { id: tremorsense.id, range: '' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Darkvision' }));
    expect(saved()).toEqual([{ id: tremorsense.id, range: '' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tremorsense' }));
    expect(saved()).toBeNull();
    expect(screen.getByText('No senses beyond sight.')).toBeTruthy();
  });

  it('moves the focus to "Add sense" when a sense is removed', () => {
    render(<Harness initial={[{ id: darkvision.id, range: '60' }, { id: tremorsense.id, range: '' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Darkvision' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add sense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tremorsense' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add sense' }));
  });

  it('has no list of its own again when a sense is added to a token without one and removed', () => {
    render(<Harness initial={null} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    expect(saved()).toEqual([{ id: darkvision.id, range: '' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Darkvision' }));
    expect(saved()).toBeNull();
  });

  it('offers the collection\'s senses the token lacks in a menu, each with its description, and adds the chosen one', () => {
    render(<Harness initial={[{ id: darkvision.id, range: '' }]} />);
    const add = screen.getByRole('button', { name: 'Add sense' });
    expect(add.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(add, { key: 'ArrowDown' });
    expect(add.getAttribute('aria-expanded')).toBe('true');
    const offered = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(offered.map((item) => item.textContent)).toEqual(
      dnd5e.filter((sense) => sense.id !== darkvision.id).map((sense) => `${sense.name}${sense.description}`),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${blindsight.name}`) }));
    expect(saved()).toEqual([{ id: darkvision.id, range: '' }, { id: blindsight.id, range: '' }]);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(range('Blindsight'));
  });

  it('closes the menu of senses to add with Escape, which goes no further', () => {
    render(<Harness initial={[]} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    const beyond = vi.fn();
    document.addEventListener('keydown', beyond);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    document.removeEventListener('keydown', beyond);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(beyond).not.toHaveBeenCalled();
  });

  it('offers nothing to add once the token has every sense', () => {
    render(<Harness initial={dnd5e.map(({ id }) => ({ id, range: '' }))} />);
    expect(screen.queryByRole('button', { name: 'Add sense' })).toBeNull();
  });

  it('keeps a sense the collection does not know, named as unknown, until it is removed', () => {
    render(<Harness initial={[{ id: 'other-system-echo', range: '30' }]} />);
    expect(within(rows()[0]!).getByText('Unknown sense')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Unknown sense' }));
    expect(saved()).toBeNull();
  });
});

describe('SensesEditor with senses from the statblock', () => {
  const inherited: TokenSense[] = [{ id: darkvision.id, range: 60 }, { id: blindsight.id }];

  it('shows them read-only and marked while the token has none of its own', () => {
    render(<Harness initial={null} inherited={inherited} />);
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]!).getByText('Darkvision')).toBeTruthy();
    expect(within(rows()[0]!).getByText('60 ft')).toBeTruthy();
    expect(within(rows()[1]!).getByText(`${blindsight.defaultRange} ft`)).toBeTruthy();
    for (const row of rows()) expect(within(row).getByText('from statblock')).toBeTruthy();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(saved()).toBeNull();
  });

  it('copies them onto the token with Edit, where they can be changed', () => {
    render(<Harness initial={null} inherited={inherited} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit senses' }));
    expect(saved()).toEqual([{ id: darkvision.id, range: '60' }, { id: blindsight.id, range: '' }]);
    expect(range('Darkvision').value).toBe('60');
    screen.getByRole('button', { name: 'Add sense' });
  });

  it('marks a row that still equals the statblock, and no longer once it is edited', () => {
    render(<Harness initial={[{ id: darkvision.id, range: '60' }, { id: tremorsense.id, range: '15' }]} inherited={inherited} />);
    expect(within(rows()[0]!).getByText('from statblock')).toBeTruthy();
    expect(within(rows()[1]!).queryByText('from statblock')).toBeNull();
    fireEvent.change(range('Darkvision'), { target: { value: '90' } });
    expect(within(rows()[0]!).queryByText('from statblock')).toBeNull();
  });

  it('keeps an empty list once "Edit senses" took the statblock\'s and all were removed: no senses, whatever the statblock says', () => {
    render(<Harness initial={null} inherited={inherited} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit senses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Darkvision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Blindsight' }));
    expect(saved()).toEqual([]);
    expect(screen.getByText('No senses beyond sight.')).toBeTruthy();
    expect(screen.queryByText('from statblock')).toBeNull();
    screen.getByRole('button', { name: 'Follow statblock' });
  });

  it('keeps an empty list on a token that already had senses of its own beside a statblock', () => {
    render(<Harness initial={[{ id: tremorsense.id, range: '15' }]} inherited={inherited} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tremorsense' }));
    expect(saved()).toEqual([]);
  });

  it('has no list of its own again when the last sense of a token without a statblock is removed', () => {
    render(<Harness initial={[{ id: tremorsense.id, range: '15' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tremorsense' }));
    expect(saved()).toBeNull();
  });

  it('goes back to following the statblock', () => {
    render(<Harness initial={[{ id: tremorsense.id, range: '15' }]} inherited={inherited} />);
    fireEvent.click(screen.getByRole('button', { name: 'Follow statblock' }));
    expect(saved()).toBeNull();
    expect(within(rows()[0]!).getByText('Darkvision')).toBeTruthy();
  });

  it('shows a token without senses of its own and without a statblock as an empty list to add to', () => {
    render(<Harness initial={null} />);
    expect(screen.getByText('No senses beyond sight.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Follow statblock' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    expect(saved()).toEqual([{ id: darkvision.id, range: '' }]);
  });
});
