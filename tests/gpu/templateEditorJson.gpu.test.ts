import '../setup/obsidianDom';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { APPLY_DELAY_MS } from '../../src/app/statblocks/editor/template-editor/json/TemplateJsonEditor';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frames, mount, px, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const box = (selector: string): DOMRect => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Nothing matches ${selector}.`);
  return element.getBoundingClientRect();
};

async function openJson(): Promise<HTMLTextAreaElement> {
  await userEvent.click(screen.getByRole('button', { name: 'More template actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit as JSON' }));
  await frames(2);
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Template as JSON' });
}

/** The template as JSON with the real stylesheet: where it stands, and that the card beside it stays as it was. */
describe('the template as JSON beside the card', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('covers the note column and nothing else: the card keeps its place and width, the text ends before the dock', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const note = box('.atlas-te-note');
    const card = box('.atlas-te-stage');
    const field = await openJson();

    const json = box('.atlas-te-json');
    expect([json.left, json.top, json.right, json.bottom]).toEqual([note.left, note.top, note.right, note.bottom]);
    const after = box('.atlas-te-stage');
    expect([after.left, after.width]).toEqual([card.left, card.width]);
    expect(getComputedStyle(document.querySelector('.atlas-te-note__editor')!).visibility).toBe('hidden');

    const text = field.getBoundingClientRect();
    expect(text.right).toBeLessThanOrEqual(box('.atlas-te-dock').left);
    expect(text.left).toBeGreaterThanOrEqual(json.left);
    expect(text.height).toBeGreaterThan(300);
    // One padding on the three sides the dock does not stand at, and the same between the parts.
    const style = getComputedStyle(document.querySelector('.atlas-te-json')!);
    const padding = px(style.paddingTop);
    expect([px(style.paddingLeft), px(style.paddingBottom), px(style.rowGap)]).toEqual([padding, padding, padding]);
    expect(padding).toBeGreaterThan(0);
  });

  it('draws a typed change on the card once typing pauses, and Done gives the note back', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const field = await openJson();
    const next = JSON.parse(field.value) as { layout: { blocks: unknown[] } };
    next.layout.blocks.pop();
    await userEvent.fill(field, JSON.stringify(next, null, 2));
    await act(() => wait(APPLY_DELAY_MS + 100));
    expect(session.steps).toBe(1);
    expect(document.querySelectorAll('.atlas-te-stage [data-block-id]').length).toBeGreaterThan(0);
    expect(session.template.layout.blocks.map((block) => block.type)).toEqual(['stat', 'row']);
    expect(document.querySelector('.atlas-te-json__problems[data-refused]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await frames(2);
    expect(document.querySelector('.atlas-te-json')).toBeNull();
    expect(getComputedStyle(document.querySelector('.atlas-te-note__editor')!).visibility).toBe('visible');
    expect(document.activeElement?.closest('.atlas-te-stage')).not.toBeNull();
  });

  it('stands under the card where the view is too narrow for two columns, as the note does', async () => {
    mount(new FakeSession(sampleTemplate()), 600);
    await frames(2);
    const field = await openJson();
    const note = box('.atlas-te-note');
    const json = box('.atlas-te-json');
    expect([json.left, json.right]).toEqual([note.left, note.right]);
    // The card's panel takes at most half the view and scrolls: the text stands under the panel.
    expect(json.top).toBeGreaterThanOrEqual(box('.atlas-sb-note-panel').bottom - 1);
    expect(field.getBoundingClientRect().height).toBeGreaterThan(80);
    const style = getComputedStyle(document.querySelector('.atlas-te-json')!);
    expect(px(style.paddingLeft)).toBe(px(style.paddingTop));
  });
});
