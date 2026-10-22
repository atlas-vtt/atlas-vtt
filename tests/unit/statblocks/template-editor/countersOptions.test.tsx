// @vitest-environment jsdom
import { cleanup, fireEvent, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { insertItems } from '../../../../src/app/statblocks/editor/template-editor/insertItems';
import { newFieldFor } from '../../../../src/app/statblocks/model/newFields';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate } from './editorKit';
import { mountEditor, tileOptions, typeAndLeave } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const SLOTS: TemplateField = {
  key: 'slots', label: 'Spell slots', type: 'counters',
  counterRows: [{ name: '1st level', max: 4 }, { name: '2nd level', max: 3 }],
};

function withCounters(): StatblockTemplate {
  const sample = sampleTemplate();
  return {
    ...sample,
    fields: [...sample.fields, SLOTS],
    layout: { ...sample.layout, blocks: [...sample.layout.blocks, { id: 'slots001', type: 'counters', field: 'slots' }] },
  };
}

const rows = (session: FakeSession): TemplateField['counterRows'] => session.template.fields.find((field) => field.key === 'slots')?.counterRows;

function open(): { session: FakeSession; options: HTMLElement } {
  const session = new FakeSession(withCounters());
  const { frame } = mountEditor(session);
  fireEvent.click(frame('slots001'));
  return { session, options: tileOptions() };
}

describe('a Counters tile in the template editor', () => {
  it('is one of the kinds the dock and the insert menu offer', () => {
    expect(insertItems().map((item) => item.label)).toContain('Counters');
  });

  it('makes a Counters property when a new tile is named', () => {
    expect(newFieldFor({ id: 'slots002', type: 'counters', field: '' }, 'ki', 'Ki')).toEqual({ key: 'ki', label: 'Ki', type: 'counters' });
  });

  it('adds a row in its Options, one step', () => {
    const { session, options } = open();
    const add = within(options).getByPlaceholderText('Add a row, like Ki');
    fireEvent.change(add, { target: { value: 'Arcane Recovery' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(rows(session)).toEqual([...SLOTS.counterRows!, { name: 'Arcane Recovery', max: 1 }]);
    expect(session.steps).toBe(1);
  });

  it('removes a row and moves one, one step each', () => {
    const { session, options } = open();
    fireEvent.click(within(options).getByRole('button', { name: 'Move 2nd level up' }));
    expect(rows(session)?.map((row) => row.name)).toEqual(['2nd level', '1st level']);
    expect(session.steps).toBe(1);
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Remove 1st level' }));
    expect(rows(session)?.map((row) => row.name)).toEqual(['2nd level']);
    expect(session.steps).toBe(2);
  });

  it('renames a row and sets its uses and what it regains, typing being one step, and asks for no recovery button', () => {
    const { session, options } = open();
    typeAndLeave(within(options).getByRole('textbox', { name: 'Row 1' }), '1', '1s', '1st');
    expect(rows(session)?.[0]?.name).toBe('1st');
    expect(session.steps).toBe(1);
    typeAndLeave(within(tileOptions()).getByRole('textbox', { name: 'Uses of 1st' }), '2');
    expect(rows(session)?.[0]?.max).toBe(2);
    expect(session.steps).toBe(2);
    typeAndLeave(within(tileOptions()).getByRole('textbox', { name: 'Uses 1st regains' }), '1d', '1d4');
    expect(rows(session)?.[0]).toEqual({ name: '1st', max: 2, regain: '1d4' });
    expect(session.steps).toBe(3);
    typeAndLeave(within(tileOptions()).getByRole('textbox', { name: 'Uses 1st regains' }), '');
    expect(rows(session)?.[0]).toEqual({ name: '1st', max: 2 });
    expect(session.steps).toBe(4);
    expect(within(tileOptions()).queryByRole('combobox')).toBeNull();
  });

  it('offers no Roll as a bonus', () => {
    const { options } = open();
    expect(within(options).queryByRole('switch', { name: 'Roll as a bonus' })).toBeNull();
  });
});
