// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL: the lab shows its dice without pictures.
vi.mock('../../../../src/app/dice3d/dieImages', () => ({ dieImage: () => null, drawDieImages: async () => undefined }));
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { withDiceSet } from '../../../../src/app/statblocks/editor/template-editor/dice/templateDiceEdit';
import { TemplateEditor } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';
import { FakeSession, sampleTemplate } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

function setup(session: FakeSession): void {
  render(
    <TooltipProvider>
      <SurfaceMenuProvider ownerId="test">
        <TemplateEditor session={session} host={{ save: vi.fn(async () => null), close: vi.fn() }} collectionId={null} />
      </SurfaceMenuProvider>
    </TooltipProvider>,
  );
}

async function openDiceRolls(): Promise<HTMLElement> {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More template actions' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Dice rolls…' }));
  return screen.getByRole('dialog', { name: 'Dice rolls' });
}

describe('a template\'s dice rolls', () => {
  it('are stored on the template and survive a round trip through its file', () => {
    const template = withDiceSet(sampleTemplate(), 'set-duality');
    const read = parseTemplate(serializeTemplate(template));
    expect(read.template?.diceSetId).toBe('set-duality');
    expect(read.problems.filter((problem) => problem.includes('dice'))).toEqual([]);
    expect(parseTemplate(serializeTemplate({ ...template, diceSetId: '' })).template).not.toHaveProperty('diceSetId');
    expect(withDiceSet(template, null)).not.toHaveProperty('diceSetId');
    expect(withDiceSet(template, 'set-duality')).toBe(template);
  });

  it('of the built-in system templates name their system\'s set', () => {
    const sets = Object.fromEntries(BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn.template.diceSetId]));
    expect(sets).toMatchObject({
      'builtin:5e-2024-monster': 'builtin:d20',
      'builtin:5e-2014-monster': 'builtin:d20',
      'builtin:cairn-creature': 'builtin:d20-roll-under',
      'builtin:draw-steel-monster': 'builtin:power-roll',
      'builtin:percentile-creature': 'builtin:d100-roll-under',
    });
    expect(sets['builtin:generic-creature']).toBeUndefined();
  });

  it('are picked in Dice rolls…: the collection\'s dice first with its set, a pick one undo step', async () => {
    const session = new FakeSession(sampleTemplate());
    setup(session);
    const dialog = await openDiceRolls();
    const list = within(dialog).getByRole('listbox', { name: 'Dice rolls' });
    const choices = within(list).getAllByRole('option');
    // The collection's dice come first, marked the default, saying the set they roll now
    expect(choices[0]?.textContent).toContain('Collection\'s dice');
    expect(choices[0]?.textContent).toContain('Default');
    expect(choices[0]?.textContent).toContain('d20');
    expect(choices[0]?.getAttribute('aria-selected')).toBe('true');
    // Each set is named with what it does
    const power = within(list).getByRole('option', { name: /^Power roll, Built-in, 2d10, crits on\s19–20, advantage\s\+2$/ });
    fireEvent.click(power);
    expect(session.template.diceSetId).toBe('builtin:power-roll');
    expect(session.steps).toBe(1);
    expect(power.getAttribute('aria-selected')).toBe('true');
    // Picking the chosen set again is no step
    fireEvent.click(power);
    expect(session.steps).toBe(1);
    fireEvent.click(choices[0]!);
    expect(session.template).not.toHaveProperty('diceSetId');
  });

  it('are worked from the keyboard: the arrows move focus without picking, Enter picks', async () => {
    const session = new FakeSession(sampleTemplate());
    setup(session);
    const dialog = await openDiceRolls();
    const choices = within(dialog).getAllByRole('option');
    // One stop for Tab: the chosen entry
    expect(choices.map((choice) => choice.tabIndex)).toEqual(choices.map((_, i) => (i === 0 ? 0 : -1)));
    choices[0]!.focus();
    fireEvent.keyDown(choices[0]!, { key: 'ArrowDown' });
    fireEvent.keyDown(choices[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(choices[2]);
    expect(session.steps).toBe(0);
    fireEvent.keyDown(choices[2]!, { key: 'End' });
    expect(document.activeElement).toBe(choices.at(-1));
    fireEvent.keyDown(choices.at(-1)!, { key: 'Home' });
    expect(document.activeElement).toBe(choices[0]);
    fireEvent.keyDown(choices[0]!, { key: 'ArrowDown' });
    fireEvent.keyDown(choices[1]!, { key: ' ' });
    expect(session.template.diceSetId).toBe('builtin:d20');
    expect(session.steps).toBe(1);
    expect(choices[1]!.tabIndex).toBe(0);
  });

  it('opens the dice lab over the dialog, and Escape closes the lab alone', async () => {
    setup(new FakeSession(sampleTemplate()));
    const dialog = await openDiceRolls();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dice lab…' }));
    const lab = screen.getByRole('dialog', { name: 'Dice lab' });
    expect(within(lab).getByRole('list', { name: 'Dice sets' })).toBeTruthy();
    fireEvent.keyDown(lab, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dice lab' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Dice rolls' })).toBeTruthy();
  });

  it('cannot be picked on a template from a newer Atlas', async () => {
    const session = new FakeSession(sampleTemplate(), { readOnly: true });
    setup(session);
    const dialog = await openDiceRolls();
    const choices = within(dialog).getAllByRole('option');
    expect(choices.every((choice) => choice.getAttribute('aria-disabled') === 'true')).toBe(true);
    fireEvent.click(choices[1]!);
    fireEvent.keyDown(choices[1]!, { key: 'Enter' });
    expect(session.template).not.toHaveProperty('diceSetId');
  });
});
