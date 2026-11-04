import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FakeSession, sampleTemplate, shape } from '../unit/statblocks/template-editor/editorKit';
import { frame, frames, mount, useEditorStyles, wait, walk } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * The keys of what hangs from the selected tile, in a real browser (§11.1,
 * §17 F1): Tab passes through the dock, the tile's toolbar and its Options,
 * both ways, with no trap; the Options take focus when they open and keep
 * the tile's keys away while focus is in them.
 */
const shownOptions = (): HTMLElement | null => document.querySelector<HTMLElement>('.atlas-te-options:not([data-closing])');
const focusBefore = (): void => page.getByRole('button', { name: 'Before' }).element().focus();

/** Selects a tile with a real click and opens its Options with Shift+Enter. */
async function openOptions(id: string): Promise<HTMLElement> {
  await userEvent.click(frame(id));
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
  await wait(250);
  return shownOptions()!;
}

describe('the selected tile\'s toolbar and Options by keyboard', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('lets Tab pass through the dock, the tile\'s toolbar and its Options both ways', async () => {
    mount(new FakeSession(sampleTemplate()), 1400);
    await userEvent.click(frame('stat-hp1'));
    await frames(2);
    focusBefore();
    expect(await walk('After', false)).toEqual(['note', 'resize', 'header', 'canvas', 'dock', 'toolbar', 'After']);
    expect(await walk('Before', true)).toEqual(['toolbar', 'dock', 'canvas', 'header', 'resize', 'note', 'Before']);

    await openOptions('stat-hp1');
    focusBefore();
    expect(await walk('After', false)).toEqual(['note', 'resize', 'header', 'canvas', 'dock', 'toolbar', 'options', 'After']);
    expect(await walk('Before', true)).toEqual(['options', 'toolbar', 'dock', 'canvas', 'header', 'resize', 'note', 'Before']);
    expect(shownOptions(), 'Tab closes nothing').not.toBeNull();
  });

  it('opens the Options on their first control and keeps the tile\'s keys away: Delete there removes no tile, and text is typed as text', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1180);
    const options = await openOptions('stat-ac1');
    expect(document.activeElement).toBe(options.querySelector('button, input, textarea'));
    await userEvent.keyboard('{Delete}{Backspace}');
    expect(shape(session.template.layout.blocks)).toBe(shape(sampleTemplate().layout.blocks));
    expect(session.steps).toBe(0);

    const unit = page.getByRole('textbox', { name: 'Unit' }).element() as HTMLInputElement;
    unit.focus();
    await userEvent.keyboard('mi/hx{Backspace}');
    expect(unit.value).toBe('mi/h');
    expect(session.template.fields.find((field) => field.key === 'ac')?.unit).toBe('mi/h');
    expect(shape(session.template.layout.blocks)).toBe(shape(sampleTemplate().layout.blocks));
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('primary');
    expect(shownOptions()).not.toBeNull();
  });
});
