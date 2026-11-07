// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { APPLY_DELAY_MS, TemplateJsonEditor } from '../../../../src/app/statblocks/editor/template-editor/json/TemplateJsonEditor';
import { readTemplateJson } from '../../../../src/app/statblocks/editor/template-editor/json/templateJson';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate } from './editorKit';
import { mountEditor, renderInEditor } from './sidePanesKit';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function open(session: FakeSession, onDone: () => void = vi.fn()): HTMLTextAreaElement {
  renderInEditor(session, <TemplateJsonEditor onDone={onDone} />);
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Template as JSON' });
}

function type(field: HTMLTextAreaElement, text: string): void {
  act(() => { fireEvent.change(field, { target: { value: text } }); });
}

function pause(): void {
  act(() => { vi.advanceTimersByTime(APPLY_DELAY_MS); });
}

/** The sample as a file holds it: the kit's readable block ids are no ids of the format, so reading gives each block one. */
function fileTemplate(): StatblockTemplate {
  const sample = sampleTemplate();
  const read = readTemplateJson(serializeTemplate(sample), sample.id).template;
  if (!read) throw new Error('The sample is no template.');
  return read;
}

/** The sample without its divider, as its file text. */
function withoutDivider(): string {
  const template = fileTemplate();
  return serializeTemplate({ ...template, layout: { ...template.layout, blocks: template.layout.blocks.slice(0, -1) } });
}

describe('reading a typed template', () => {
  const id = sampleTemplate().id;

  it('takes a whole template of the same id', () => {
    const whole = fileTemplate();
    expect(readTemplateJson(serializeTemplate(whole), id)).toEqual({ template: whole, problems: [] });
  });

  it('puts back the field of a part of the header the text leaves out, and says so', () => {
    const whole = fileTemplate();
    expect(whole.fields.find((field) => field.key === 'level')).toBeDefined();
    const withoutLevel = { ...whole, fields: whole.fields.filter((field) => field.key !== 'level') };
    const reading = readTemplateJson(serializeTemplate(withoutLevel), id);
    expect(reading.template?.fields.at(-1)).toMatchObject({ key: 'level', meaning: 'rating' });
    expect(reading.problems.at(-1)).toContain('put back');
  });

  it('refuses text that is no JSON, no template, or another template, each with a sentence', () => {
    for (const text of ['{ "format": ', '[]', serializeTemplate({ ...sampleTemplate(), id: 'another-template-zz9999' })]) {
      const reading = readTemplateJson(text, id);
      expect(reading.template).toBeNull();
      expect(reading.problems.length).toBeGreaterThan(0);
    }
    expect(readTemplateJson(serializeTemplate({ ...sampleTemplate(), id: 'another-template-zz9999' }), id).problems.at(-1)).toContain(id);
  });
});

describe('the template as JSON', () => {
  it('shows the file text and takes a valid change as one undo step once typing pauses', () => {
    const session = new FakeSession(fileTemplate());
    const field = open(session);
    expect(field.value).toBe(serializeTemplate(fileTemplate()));
    const next = withoutDivider();
    type(field, next.slice(0, -3));
    type(field, next);
    expect(session.steps).toBe(0);
    pause();
    expect(session.steps).toBe(1);
    // The Name title and the level Value the text still has are the header's, which draws them once.
    expect(session.template.layout.blocks.map((block) => block.type)).toEqual(['stat', 'row']);
    // What was typed stays as typed, and a second pause takes nothing more.
    expect(field.value).toBe(next);
    pause();
    expect(session.steps).toBe(1);
  });

  it('takes nothing from text it cannot read, says why, and keeps the text', () => {
    const session = new FakeSession(fileTemplate());
    const field = open(session);
    type(field, '{ "format": ');
    pause();
    expect(session.steps).toBe(0);
    expect(screen.getByRole('status').textContent).toMatch(/^Not taken yet\..*not valid JSON/);
    expect(field.value).toBe('{ "format": ');
  });

  it('keeps formatting that says the same, and takes no step for it', () => {
    const session = new FakeSession(fileTemplate());
    const field = open(session);
    const compact = JSON.stringify(JSON.parse(field.value) as unknown);
    type(field, compact);
    pause();
    expect(session.steps).toBe(0);
    expect(field.value).toBe(compact);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('follows a change made elsewhere, also over text it could not read', () => {
    const session = new FakeSession(fileTemplate());
    const field = open(session);
    type(field, 'not json');
    const changed: StatblockTemplate = { ...fileTemplate(), description: 'For marsh creatures' };
    act(() => session.apply(() => changed));
    expect(field.value).toBe(serializeTemplate(changed));
    act(() => session.undo());
    expect(field.value).toBe(serializeTemplate(fileTemplate()));
  });

  it('takes what was typed within the pause on leaving the field and when it closes', () => {
    const session = new FakeSession(fileTemplate());
    const field = open(session);
    type(field, withoutDivider());
    act(() => { fireEvent.blur(field); });
    expect(session.steps).toBe(1);

    cleanup();
    const other = new FakeSession(fileTemplate());
    type(open(other), withoutDivider());
    cleanup();
    expect(other.steps).toBe(1);
  });

  it('shows a template of a newer Atlas read-only, with the reason', () => {
    const session = new FakeSession(fileTemplate(), { readOnly: true, readOnlyReason: 'newer' });
    const field = open(session);
    expect(field.readOnly).toBe(true);
    expect(screen.getByText('Update Atlas to edit this template.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('closes on Done', () => {
    const onDone = vi.fn();
    open(new FakeSession(fileTemplate()), onDone);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('opens over the note from the template menu, and Done gives focus back to the card', async () => {
    vi.useRealTimers();
    // jsdom lays nothing out: the card's focus scrolls nowhere.
    Element.prototype.scrollIntoView = vi.fn();
    mountEditor(new FakeSession(fileTemplate()), { menus: true });
    fireEvent.keyDown(screen.getByRole('button', { name: 'More template actions' }), { key: 'Enter' });
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit as JSON' })); });
    const field = screen.getByRole('textbox', { name: 'Template as JSON' });
    expect(field.closest('.atlas-te-note')?.hasAttribute('data-covered')).toBe(true);
    expect(document.activeElement).toBe(field);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Done' })); });
    expect(screen.queryByRole('textbox', { name: 'Template as JSON' })).toBeNull();
    expect(document.querySelector('.atlas-te-note')?.hasAttribute('data-covered')).toBe(false);
    expect(document.activeElement?.closest('.atlas-te-stage')).not.toBeNull();
  });
});
