// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RecoveryEditor } from '../../../../src/app/statblocks/editor/rests/RecoveryEditor';
import { parseRecoveryButtons } from '../../../../src/app/recovery/parseRecovery';
import type { RecoveryButton } from '../../../../src/app/recovery/recoveryTypes';
import { ADVENTURER, CONDITIONS, RESOURCES } from '../../../fixtures/recoveryFixtures';

const REST: RecoveryButton = { id: 'rest-a1b2c3', name: 'Rest', rules: [] };

/** The editor over one button, handing back the buttons after every edit. */
function mount(initial: readonly RecoveryButton[] = [REST]): () => RecoveryButton {
  let latest = initial;
  function Editor(): React.ReactElement {
    const [buttons, setButtons] = useState(initial);
    return (
      <RecoveryEditor template={ADVENTURER} name="Adventurer" buttons={buttons} resources={RESOURCES} conditions={CONDITIONS}
        onButtonsChange={(next) => { latest = next; setButtons(next); }} />
    );
  }
  render(<Editor />);
  return () => latest[0]!;
}

const addStep = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Add a step' })); };
const step = (): HTMLElement => screen.getByRole('region', { name: 'Choose one' });
const hpSpot = (): HTMLElement => screen.getByRole('button', { name: /^HP: / });

// The rule card scrolls itself into view, which jsdom does not lay out
beforeAll(() => {
  Element.prototype.scrollIntoView = (): void => undefined;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('the steps of a recovery action', () => {
  it('adds a step asking for exactly one of a single option, selects that option and focuses the prompt', () => {
    const button = mount();
    addStep();
    const choice = button().choices![0]!;
    expect(choice).toMatchObject({ prompt: 'Choose one', min: 1, max: 1, actions: [{ name: 'Option', rules: [] }] });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'What the player is asked' }));
    expect(within(step()).getByRole('button', { name: 'Option', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Always', pressed: false })).toBeTruthy();
    // What the editor stores reads back whole
    expect(parseRecoveryButtons([button()])).toEqual([button()]);
  });

  it('sets a rule on the picked action, apart from what the button always does', () => {
    const button = mount();
    addStep();
    fireEvent.click(hpSpot());
    expect(button().choices![0]!.actions[0]!.rules).toEqual([{ target: { kind: 'resource', field: 'hp' }, does: 'full' }]);
    expect(button().rules).toEqual([]);
    expect(hpSpot().getAttribute('aria-label')).toBe('HP: Full');

    fireEvent.click(screen.getByRole('button', { name: 'Always' }));
    expect(hpSpot().getAttribute('aria-label')).toBe('HP: not given back');
  });

  it('asks for exactly or up to a number of picks, and lets an action be picked again', () => {
    const button = mount();
    addStep();
    fireEvent.click(screen.getByRole('radio', { name: 'Up to' }));
    expect(button().choices![0]).toMatchObject({ min: 0, max: 1 });

    // One action and no repeats: one pick at most
    fireEvent.click(screen.getByRole('combobox', { name: 'Number of picks' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['1']);
    fireEvent.click(screen.getByRole('combobox', { name: 'Number of picks' }));

    fireEvent.click(screen.getByRole('switch', { name: 'Pick the same option again' }));
    expect(button().choices![0]!.repeat).toBe(true);
    fireEvent.click(screen.getByRole('combobox', { name: 'Number of picks' }));
    fireEvent.click(screen.getByRole('option', { name: '3' }));
    expect(button().choices![0]).toMatchObject({ min: 0, max: 3 });

    fireEvent.click(screen.getByRole('radio', { name: 'Exactly' }));
    expect(button().choices![0]).toMatchObject({ min: 3, max: 3 });

    // Repeats off again: no more picks than actions
    fireEvent.click(screen.getByRole('switch', { name: 'Pick the same option again' }));
    expect(button().choices![0]).toMatchObject({ min: 1, max: 1 });
    expect('repeat' in button().choices![0]!).toBe(false);
  });

  it('names an action, says what it does and opens it to another player character', () => {
    const button = mount();
    addStep();
    const name = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(name, { target: { value: 'Tend to Wounds' } });
    fireEvent.blur(name);
    const text = screen.getByRole('textbox', { name: 'What it does' });
    fireEvent.change(text, { target: { value: 'Clear 1d4 HP.' } });
    fireEvent.keyDown(text, { key: 'Enter' });
    fireEvent.click(screen.getByRole('switch', { name: 'For oneself or another' }));
    expect(button().choices![0]!.actions[0]).toMatchObject({ name: 'Tend to Wounds', text: 'Clear 1d4 HP.', forOthers: true });

    // A blank name is never stored
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.blur(name);
    expect(button().choices![0]!.actions[0]!.name).toBe('Tend to Wounds');
  });

  it('brings the counts within the actions left when one is removed, and keeps the last', () => {
    const button = mount();
    addStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add an option' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Option name' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Number of picks' }));
    fireEvent.click(screen.getByRole('option', { name: '2' }));
    expect(button().choices![0]).toMatchObject({ min: 2, max: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Remove this option' }));
    expect(button().choices![0]).toMatchObject({ min: 1, max: 1 });
    expect(button().choices![0]!.actions).toHaveLength(1);

    // The last action of a step stays
    const remove = screen.getByRole('button', { name: 'Remove this option' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(remove);
    expect(button().choices![0]!.actions).toHaveLength(1);
  });

  it('removes a step, the button keeping no empty list of steps, and goes back to Always', () => {
    const button = mount();
    addStep();
    fireEvent.click(screen.getByRole('button', { name: 'Remove this step' }));
    expect(button()).toEqual(REST);
    expect(screen.getByRole('button', { name: 'Always', pressed: true })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a step' }));
  });
});
