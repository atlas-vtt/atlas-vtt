import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import React from 'react';
import { render } from '@testing-library/react';
import type { App } from 'obsidian';
import { TemplateEditorContext, type TemplateEditorContextValue } from '../../src/app/statblocks/editor/template-editor/editorContext';
import { BODY_PLACEHOLDER, TemplateBodyColumn } from '../../src/app/statblocks/editor/template-editor/shell/TemplateBodyColumn';
import { SAVE_HINT } from '../../src/app/statblocks/editor/template-editor/shell/TemplateCapsule';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frames, mount, px, useEditorStyles } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * The template's note column with the real stylesheet. Obsidian's own editor
 * cannot run here: the column's stand-in is measured as it is drawn, and the
 * note view is the element tree Obsidian gives a Markdown view, put where the
 * column hosts it. What the editor does is checked in Obsidian itself.
 */
const h = React.createElement;
const NOTE_FONT = 'Georgia, serif';
const LINE_WIDTH = 640;
const MARGIN = 32;

function mountNote(session: FakeSession, width = 1400): HTMLElement {
  const root = mount(session, width);
  const editor = root.closest<HTMLElement>('.atlas-statblock-editor')!;
  editor.style.setProperty('--font-text', NOTE_FONT);
  editor.style.setProperty('--file-line-width', `${LINE_WIDTH}px`);
  editor.style.setProperty('--file-margins', `${MARGIN}px`);
  editor.style.setProperty('--line-height-normal', '1.5');
  return root;
}

/** A Markdown view as Obsidian builds one, showing an empty note, in the column's host as the column puts it there. */
function hostNoteView(root: HTMLElement, lines: string[]): HTMLElement {
  const column = root.querySelector<HTMLElement>('.atlas-te-note__editor')!;
  for (const child of column.children) (child as HTMLElement).style.display = 'none';
  const host = column.createDiv({ cls: 'atlas-te-note__host', attr: { 'data-te-hosted-note': '' } });
  host.style.setProperty('--atlas-te-note-placeholder', JSON.stringify(BODY_PLACEHOLDER));
  const view = host.createDiv({ cls: 'workspace-leaf-content atlas-embedded-leaf-view atlas-embedded-leaf-view--fill-editor atlas-te-note__view' });
  view.createDiv({ cls: 'view-header', text: 'Marsh creature' });
  const source = view.createDiv({ cls: 'view-content' }).createDiv({ cls: 'markdown-source-view mod-cm6 is-readable-line-width' });
  const scroller = source.createDiv({ cls: 'cm-editor' }).createDiv({ cls: 'cm-scroller' });
  const sizer = scroller.createDiv({ cls: 'cm-sizer' });
  sizer.createDiv({ cls: 'inline-title', text: 'Marsh creature' });
  sizer.createDiv({ cls: 'metadata-container', text: 'Properties' });
  const content = sizer.createDiv({ cls: 'cm-content', attr: { contenteditable: 'true' } });
  for (const text of lines) {
    const line = content.createDiv({ cls: 'cm-line' });
    if (text === '') line.createEl('br');
    else line.setText(text);
  }
  return view;
}

/** The column alone, as the editor holds it, with an app that has a vault: the offer to start from a note needs one. */
function mountColumn(session: FakeSession): HTMLElement {
  const app = { vault: { on: () => ({}), offref: () => undefined } } as unknown as App;
  const context = { app, session, snapshot: session.getSnapshot() } as TemplateEditorContextValue;
  render(h('div', { className: 'atlas-vtt-plugin' },
    h('div', { className: 'atlas-statblock-editor', style: { height: 600, width: 800, display: 'grid', '--font-text': NOTE_FONT, '--file-line-width': `${LINE_WIDTH}px`, '--file-margins': `${MARGIN}px`, '--line-height-normal': '1.5', '--font-text-size': '16px' } as React.CSSProperties },
      h(Live, { session, context }))));
  return document.querySelector<HTMLElement>('.atlas-te-note')!;
}

/** Follows the session, as the editor does. */
function Live({ session, context }: { session: FakeSession; context: TemplateEditorContextValue }): React.JSX.Element {
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot);
  return h(TemplateEditorContext.Provider, { value: { ...context, snapshot } },
    h(TemplateBodyColumn, { app: context.app, previewRef: { current: null } }));
}

describe('the template\'s note column', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('stands where a note\'s text starts, with the note\'s font, readable line and margins, before the dock', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(3);
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
    expect(note.right, 'the note column ends where the panel begins').toBeCloseTo(panel.left, 0);

    const standIn = root.querySelector<HTMLElement>('.atlas-te-note__stand-in')!;
    const line = root.querySelector<HTMLElement>('.atlas-te-note__line')!;
    expect(line.textContent).toBe(BODY_PLACEHOLDER);
    expect(getComputedStyle(standIn).fontFamily).toBe(NOTE_FONT);
    const room = standIn.getBoundingClientRect();
    const left = room.left + px(getComputedStyle(standIn).paddingLeft);
    const right = room.right - px(getComputedStyle(standIn).paddingRight);
    expect(px(getComputedStyle(standIn).paddingLeft)).toBe(MARGIN);
    const text = line.getBoundingClientRect();
    expect(text.width).toBeCloseTo(Math.min(LINE_WIDTH, right - left), 0);
    expect(text.left - left).toBeCloseTo(right - text.right, 0);
    expect(text.top - room.top).toBeCloseTo(MARGIN, 0);
    expect(text.right, 'the text ends before the dock').toBeLessThanOrEqual(root.querySelector('.atlas-te-dock')!.getBoundingClientRect().left);
    expect(standIn.getBoundingClientRect().height, 'a click anywhere in the column starts the note').toBeCloseTo(note.height, 0);
  });

  it('gives Obsidian\'s note view the whole column, without its header, title or properties, its text ending before the dock', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(2);
    const view = hostNoteView(root, ['## Lair', 'Where it sleeps.']);
    await frames(2);
    const column = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const shown = view.getBoundingClientRect();
    expect([shown.left, shown.top, shown.right, shown.bottom]).toEqual([column.left, column.top, column.right, column.bottom]);
    expect(getComputedStyle(view.querySelector('.view-header')!).display).toBe('none');
    expect(getComputedStyle(view.querySelector('.inline-title')!).display).toBe('none');
    expect(getComputedStyle(view).getPropertyValue('--metadata-display-editing').trim()).toBe('none');
    const scroller = view.querySelector<HTMLElement>('.cm-scroller')!;
    const textEnd = scroller.getBoundingClientRect().right - px(getComputedStyle(scroller).paddingInlineEnd);
    expect(textEnd, 'the text ends before the dock').toBeLessThanOrEqual(root.querySelector('.atlas-te-dock')!.getBoundingClientRect().left);
    expect(getComputedStyle(view.querySelector('.cm-line')!, '::before').content).toBe('none');
  });

  it('says what to write in an empty note', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(2);
    const view = hostNoteView(root, ['']);
    await frames(1);
    expect(getComputedStyle(view.querySelector('.cm-line')!, '::before').content).toBe(JSON.stringify(BODY_PLACEHOLDER));
  });

  it('takes typing at once in a template just made: its text stands where a note\'s does, before the dock', async () => {
    const session = new FakeSession(sampleTemplate(), { path: null, unsaved: true });
    const root = mountNote(session);
    await frames(3);
    const text = root.querySelector<HTMLTextAreaElement>('.atlas-te-note__draft-text')!;
    expect(document.activeElement, 'the cursor is in the text').toBe(text);
    expect(getComputedStyle(text).fontFamily).toBe(NOTE_FONT);
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const draft = root.querySelector<HTMLElement>('.atlas-te-note__draft')!;
    const left = note.left + px(getComputedStyle(draft).paddingLeft);
    const right = note.right - px(getComputedStyle(draft).paddingRight);
    const box = text.getBoundingClientRect();
    expect(box.width).toBeCloseTo(Math.min(LINE_WIDTH, right - left), 0);
    expect(box.left - left).toBeCloseTo(right - box.right, 0);
    expect(box.top - note.top).toBeCloseTo(MARGIN, 0);
    expect(box.bottom, 'the text box fills the column').toBeCloseTo(note.bottom - MARGIN, 0);
    expect(box.right, 'the text ends before the dock').toBeLessThanOrEqual(root.querySelector('.atlas-te-dock')!.getBoundingClientRect().left);

    await userEvent.type(text, 'Lair');
    expect(session.getSnapshot().draftBody).toBe('Lair');
    expect(text.value).toBe('Lair');
    // A press in the margin beside the text puts the cursor back in it.
    text.blur();
    await userEvent.click(draft, { position: { x: 4, y: 4 } });
    expect(document.activeElement).toBe(text);
  });

  it('offers a note to start from under the placeholder of an empty text, its icon where the text starts, and leaves once there is text', async () => {
    const session = new FakeSession(sampleTemplate(), { path: null, unsaved: true });
    const column = mountColumn(session);
    await frames(2);
    const text = column.querySelector<HTMLTextAreaElement>('.atlas-te-note__draft-text')!;
    const box = text.getBoundingClientRect();
    const offer = column.querySelector<HTMLElement>('.atlas-te-note__from-note')!;
    expect(offer.querySelector('svg')!.getBoundingClientRect().left).toBeCloseTo(box.left, 0);
    const lineHeight = px(getComputedStyle(text).lineHeight);
    expect(offer.getBoundingClientRect().top, 'it stands under the placeholder').toBeGreaterThanOrEqual(box.top + lineHeight);
    expect(document.elementFromPoint(box.left + 200, box.top + lineHeight * 4), 'the rest of the column is the text\'s').toBe(text);
    await userEvent.type(text, 'Lair');
    expect(column.querySelector('.atlas-te-note__from-note')).toBeNull();
  });

  it('tells over Save what it covers, also while there is nothing to save', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(2);
    const save = root.querySelector<HTMLElement>('.atlas-te-capsule__save')!;
    expect(save.getAttribute('aria-disabled')).toBe('true');
    await userEvent.hover(save);
    await expect.poll(() => document.querySelector('.tooltip-inner')?.textContent, { timeout: 2000 }).toBe(SAVE_HINT);
  });
});
