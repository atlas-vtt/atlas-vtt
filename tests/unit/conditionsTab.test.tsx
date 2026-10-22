// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { ConditionsTab } from '../../src/app/react/components/collection-settings/ConditionsTab';
import { CONDITION_EFFECTS, type ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.conditions;
const own: ConditionDefinition = { id: 'own-1', name: 'Levitating', color: '#336699' };

/** The tab with the conditions it was last handed. */
function Harness({ initial }: { initial: ConditionDefinition[] }): React.ReactElement {
  const [conditions, setConditions] = useState(initial);
  return (
    <>
      <ConditionsTab conditions={conditions} onChange={setConditions} />
      <output data-testid="conditions">{JSON.stringify(conditions)}</output>
    </>
  );
}

const saved = (): ConditionDefinition[] => JSON.parse(screen.getByTestId('conditions').textContent ?? '[]') as ConditionDefinition[];
const effect = (name: string): HTMLElement => screen.getByRole('combobox', { name: `Effect on sight of ${name}` });

function choose(name: string, option: string): void {
  fireEvent.click(effect(name));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

afterEach(cleanup);

describe('ConditionsTab: effect on sight', () => {
  it('shows the effect of built-in and own conditions alike, none where a condition has none', () => {
    render(<Harness initial={[...dnd5e, own]} />);
    expect(effect('Blinded').textContent).toBe('Blinded');
    expect(effect('Invisible').textContent).toBe('Invisible');
    expect(effect('Poisoned').textContent).toBe('None');
    expect(effect('Levitating').textContent).toBe('None');
    expect(screen.getByText('Effect on sight')).toBeTruthy();
  });

  it('offers no effect and every effect the rules know', () => {
    render(<Harness initial={[own]} />);
    fireEvent.click(effect('Levitating'));
    const offered = screen.getAllByRole('option').map((option) => option.textContent);
    expect(offered).toHaveLength(CONDITION_EFFECTS.length + 1);
    expect(offered).toEqual(['None', 'Blinded', 'Invisible', 'Airborne', 'Undetected']);
  });

  it('gives a condition an effect and takes it away again, leaving no empty field behind', () => {
    render(<Harness initial={[own]} />);
    choose('Levitating', 'Airborne');
    expect(saved()).toEqual([{ ...own, effect: 'airborne' }]);
    choose('Levitating', 'None');
    expect(saved()).toEqual([own]);
    expect(saved()[0]).not.toHaveProperty('effect');
  });

  it('shows a built-in condition that stores no effect with the effect it has, and stores one only when it is changed', () => {
    const stored = dnd5e.map(({ effect: _effect, ...condition }) => condition);
    render(<Harness initial={stored} />);
    expect(effect('Blinded').textContent).toBe('Blinded');
    expect(saved().some((condition) => 'effect' in condition)).toBe(false);
    choose('Poisoned', 'Blinded');
    expect(saved().filter((condition) => 'effect' in condition).map((condition) => condition.name)).toEqual(['Poisoned']);
    choose('Blinded', 'Invisible');
    expect(saved().find((condition) => condition.name === 'Blinded')!.effect).toBe('invisible');
  });

  it('switches off the effect of a built-in condition, which stores that it has none', () => {
    render(<Harness initial={[...dnd5e]} />);
    fireEvent.click(effect('Blinded'));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['None', 'Blinded', 'Invisible', 'Airborne', 'Undetected']);
    fireEvent.click(screen.getByRole('option', { name: 'None' }));
    expect(effect('Blinded').textContent).toBe('None');
    expect(saved().find((condition) => condition.name === 'Blinded')!.effect).toBe('none');
  });

  it('stores nothing again once a built-in condition is given back its own effect', () => {
    const stored = dnd5e.map(({ effect: _effect, ...condition }) => condition);
    render(<Harness initial={stored} />);
    choose('Blinded', 'None');
    choose('Blinded', 'Blinded');
    expect(saved()).toEqual(stored);
  });

  it('names every row\'s select and has no native tooltip', () => {
    render(<Harness initial={[...dnd5e]} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(dnd5e.length);
    expect(document.querySelector('[title]')).toBeNull();
  });
});
