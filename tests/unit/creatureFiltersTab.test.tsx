// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';
import { CreatureFiltersTab } from '../../src/app/react/components/collection-settings/CreatureFiltersTab';
import type { CreatureFilterDefinition } from '../../src/app/types/creatureFilterTypes';

afterEach(cleanup);

const creature = (fields: Record<string, unknown>): IndexedCreature => ({ path: String(fields.name), templateId: null, meanings: {}, lookName: null, fields });
const CREATURES = [
  creature({ name: 'Acid Burrower', tier: 1, type: 'Solo', difficulty: 14 }),
  creature({ name: 'Bear', tier: 1, type: 'Bruiser', difficulty: 14 }),
  creature({ name: 'Dryad', tier: 3, type: 'Leader', difficulty: 16 }),
];

let latest: { hidden: string[]; custom: CreatureFilterDefinition[] } = { hidden: [], custom: [] };

interface HarnessProps {
  custom?: CreatureFilterDefinition[];
  hidden?: string[];
  creatures?: IndexedCreature[];
  pending?: boolean;
}

function Harness({ custom: initialCustom = [], hidden: initialHidden = [], creatures = CREATURES, pending = false }: HarnessProps): React.JSX.Element {
  const [custom, setCustom] = useState(initialCustom);
  const [hidden, setHidden] = useState(initialHidden);
  latest = { hidden, custom };
  return <CreatureFiltersTab hidden={hidden} onHiddenChange={setHidden} custom={custom} onCustomChange={setCustom} creatures={creatures} pending={pending} />;
}

const catalogRow = (label: string): HTMLElement => within(screen.getByRole('list', { name: 'Atlas filters' }))
  .getAllByRole('listitem').find((item) => item.textContent?.startsWith(label))!;
const suggestions = (): string[] => within(screen.getByRole('list', { name: 'Statblock fields' }))
  .getAllByRole('listitem').map((item) => item.querySelector('code')?.textContent ?? '');

it('lists Atlas’ own filters with how many statblocks have each field', () => {
  render(<Harness />);
  expect(catalogRow('Tier').textContent).toContain('3 of 3');
  expect(catalogRow('Challenge rating').textContent).toContain('Not in these statblocks');
});

it('switches Atlas’ own filters off and on', () => {
  render(<Harness />);
  const source = screen.getByRole('checkbox', { name: 'Filter by source' });
  expect((source as HTMLInputElement).checked).toBe(true);
  fireEvent.click(source);
  expect(latest.hidden).toEqual(['source']);
  fireEvent.click(source);
  expect(latest.hidden).toEqual([]);
});

it('suggests only fields no filter reads, and adds one as a filter of the detected kind', () => {
  render(<Harness />);
  expect(suggestions()).toEqual(['difficulty']);
  fireEvent.click(screen.getByRole('button', { name: 'Filter by difficulty' }));
  expect(latest.custom).toEqual([{ id: 'difficulty', label: 'Difficulty', kind: 'range', field: 'difficulty' }]);
  expect(screen.getByText('No other fields to filter by.')).toBeTruthy();
});

it('edits, retypes, reorders and removes the collection’s own filters', () => {
  render(<Harness custom={[
    { id: 'hd', label: 'HD', kind: 'range', field: 'hit_dice' },
    { id: 'kind', label: 'Kind', kind: 'options', fields: ['kind'] },
  ]} />);
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Filter label' })[1]!, { target: { value: 'Size and kind' } });
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Statblock fields' })[1]!, { target: { value: 'kind, size' } });
  expect(latest.custom[1]).toEqual({ id: 'kind', label: 'Size and kind', kind: 'options', fields: ['kind', 'size'] });

  fireEvent.click(within(screen.getAllByRole('radiogroup')[0]!).getByRole('radio', { name: 'Options' }));
  expect(latest.custom[0]).toEqual({ id: 'hd', label: 'HD', kind: 'options', fields: ['hit_dice'] });

  fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);
  expect(latest.custom.map((filter) => filter.id)).toEqual(['kind', 'hd']);

  fireEvent.click(screen.getAllByRole('button', { name: 'Remove filter' })[0]!);
  expect(latest.custom.map((filter) => filter.id)).toEqual(['hd']);
});

it('marks a filter without a field, and never gives a new filter a catalog id', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
  expect(screen.getByRole('textbox', { name: 'Statblock fields' }).getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Name the statblock field this filter reads.')).toBeTruthy();
  expect(latest.custom[0]?.id).toBe('filter');
});

it('explains what to do while no statblocks are linked, and shows progress while reading them', () => {
  const { unmount } = render(<Harness creatures={[]} />);
  expect(screen.getByText(/Link statblocks to this collection/)).toBeTruthy();
  expect(catalogRow('Tier').textContent).toContain('No linked statblocks');
  unmount();
  render(<Harness creatures={[]} pending />);
  expect(screen.getAllByText('Reading statblocks…').length).toBeGreaterThan(0);
});
