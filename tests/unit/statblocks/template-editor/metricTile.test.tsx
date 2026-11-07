// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { findAction, type SurfaceAction } from '../../../../src/app/statblocks/editor/interaction/surfaceActions';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { labelTargetOf, metricLabelParts } from '../../../../src/app/statblocks/editor/template-editor/labelTargets';
import { blockMenu } from '../../../../src/app/statblocks/editor/template-editor/menus/blockMenu';
import { addNumber, removeNumber } from '../../../../src/app/statblocks/editor/template-editor/metricActions';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { metricBlock } from '../../../../src/app/statblocks/model/metricNumbers';
import type { MetricBlock, StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const THRESHOLDS: MetricBlock = { id: 'metric01', type: 'metric', heading: 'Thresholds', fields: ['major', 'severe'] };

/** The sample template with a Metric of two numbers after its values. */
function withMetric(metric: MetricBlock = THRESHOLDS): StatblockTemplate {
  const sample = sampleTemplate();
  return {
    ...sample,
    fields: [...sample.fields, { key: 'major', label: 'Major', type: 'number' }, { key: 'severe', label: 'Severe', type: 'number' }],
    layout: { ...sample.layout, blocks: [...sample.layout.blocks, metric] },
  };
}

const fieldsOf = (session: FakeSession): string[] | undefined => metricBlock(session.template, 'metric01')?.fields;

describe('a Metric\'s labels', () => {
  it('are its group\'s heading over two numbers or more, then each number\'s name', () => {
    const template = withMetric();
    expect(metricLabelParts(THRESHOLDS)).toEqual(['heading', 0, 1]);
    expect(metricLabelParts({ ...THRESHOLDS, fields: ['major'] })).toEqual([0]);
    expect(labelTargetOf(THRESHOLDS, template.fields)).toEqual({ kind: 'heading', text: 'Thresholds', part: 'heading' });
    expect(labelTargetOf(THRESHOLDS, template.fields, 1)).toEqual({ kind: 'label', text: 'Severe', part: 1 });
    expect(labelTargetOf({ ...THRESHOLDS, fields: ['major', ''] }, template.fields, 1)).toEqual({ kind: 'new-field', text: 'Number', part: 1 });
    expect(labelTargetOf({ ...THRESHOLDS, fields: ['major'] }, template.fields)).toEqual({ kind: 'label', text: 'Major', part: 0 });
    expect(labelTargetOf({ ...THRESHOLDS, fields: ['major'] }, template.fields, 'heading')).toBeNull();
  });

  it('name a number not named yet with a number property of its own, rename it later under the same key, and rename the group', () => {
    const unnamed = withMetric({ ...THRESHOLDS, fields: ['major', ''] });
    const named = commitLabel(unnamed, 'metric01', 'Critical', [], 1);
    expect(named.bound).toEqual({ key: 'critical', created: true, fromCollection: false });
    expect(metricBlock(named.template, 'metric01')?.fields).toEqual(['major', 'critical']);
    expect(named.template.fields.at(-1)).toEqual({ key: 'critical', label: 'Critical', type: 'number' });

    const renamed = commitLabel(named.template, 'metric01', 'Deadly', [], 1).template;
    expect(metricBlock(renamed, 'metric01')?.fields).toEqual(['major', 'critical']);
    expect(renamed.fields.find((field) => field.key === 'critical')?.label).toBe('Deadly');

    expect(metricBlock(commitLabel(renamed, 'metric01', 'Damage', [], 'heading').template, 'metric01')?.heading).toBe('Damage');
  });

  it('never show one property in two numbers of a Metric', () => {
    const unnamed = withMetric({ ...THRESHOLDS, fields: ['major', ''] });
    const named = commitLabel(unnamed, 'metric01', 'Major', [], 1);
    expect(metricBlock(named.template, 'metric01')?.fields).toEqual(['major', 'major_2']);
  });
});

describe('a Metric\'s numbers, added and removed', () => {
  it('are one step each, up to six numbers and never fewer than one', () => {
    const session = new FakeSession(withMetric());
    expect(addNumber(session, 'metric01')).toEqual({ select: ['metric01'], announce: 'Added a number. Double-click its name to name it.' });
    expect(session.steps).toBe(1);
    expect(fieldsOf(session)).toEqual(['major', 'severe', '']);
    for (let count = 4; count <= 6; count++) addNumber(session, 'metric01');
    expect(fieldsOf(session)).toHaveLength(6);
    expect(addNumber(session, 'metric01')).toEqual({ announce: 'A metric holds at most 6 numbers.' });
    expect(session.steps).toBe(4);

    const removed = removeNumber(session, 'metric01', 0);
    expect(removed).toMatchObject({ select: ['metric01'], deleted: 'Major' });
    expect(session.steps).toBe(5);
    expect(fieldsOf(session)).toEqual(['severe', '', '', '', '']);
    for (let count = 0; count < 4; count++) removeNumber(session, 'metric01', 0);
    expect(fieldsOf(session)).toEqual(['']);
    expect(removeNumber(session, 'metric01', 0)).toEqual({});
    expect(session.steps).toBe(9);
    expect(session.template.fields.map((field) => field.key)).toContain('major');
  });

  it('change nothing in a read-only template', () => {
    const session = new FakeSession(withMetric(), { readOnly: true, readOnlyReason: 'newer' });
    expect(addNumber(session, 'metric01').announce).toBe('Update Atlas to edit this template.');
    expect(fieldsOf(session)).toEqual(['major', 'severe']);
  });

  it('are in the tile\'s menu: Add number, disabled at six, and Numbers with a row per number that renames it or takes it out', () => {
    const add = vi.fn();
    const remove = vi.fn();
    const rename = vi.fn();
    const menu = (metric: MetricBlock): SurfaceAction[] => blockMenu({
      template: withMetric(metric), selection: ['metric01'], blockId: 'metric01', editable: true, canPaste: false,
      run: vi.fn(), openInsert: vi.fn(), copyText: vi.fn(), parts: { add, remove, rename, move: vi.fn() },
    });
    const two = menu(THRESHOLDS);
    expect(findAction(two, 'add-number')).toMatchObject({ label: 'Add number', disabled: false });
    const submenu = two.find((action) => action.kind === 'submenu' && action.id === 'numbers');
    expect(submenu?.kind === 'submenu' && submenu.children.map((child) => child.kind !== 'separator' && child.label)).toEqual(['Major', 'Severe']);
    findAction(two, 'remove-number-1')?.run();
    expect(remove).toHaveBeenCalledWith(1);
    findAction(two, 'rename-number-0')?.run();
    expect(rename).toHaveBeenCalledWith(0);
    // A Metric's numbers keep their places.
    expect(findAction(two, 'move-number-right-0')).toBeNull();
    expect(two.at(-1)).toMatchObject({ id: 'delete' });

    expect(findAction(menu({ ...THRESHOLDS, fields: ['major', '', '', '', '', ''] }), 'add-number')).toMatchObject({ disabled: true });
    expect(findAction(menu({ ...THRESHOLDS, fields: ['major'] }), 'remove-number-0')).toMatchObject({ disabled: true });
  });
});

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };

function setup(session: FakeSession): (id: string) => HTMLElement {
  render(
    <TooltipProvider>
      <TemplateEditor session={session} host={host} collectionId={null} />
    </TooltipProvider>,
  );
  return (id) => {
    const element = document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`);
    if (!element) throw new Error(`no frame ${id}`);
    return element;
  };
}

describe('a Metric tile in the template editor', () => {
  it('adds a number from its toolbar, one step, and takes one out by its ×', () => {
    const session = new FakeSession(withMetric());
    const frame = setup(session);
    fireEvent.click(frame('metric01'));
    const toolbar = screen.getByRole('toolbar', { name: 'Metric toolbar' });
    expect(within(toolbar).getAllByRole('button').map((button) => button.textContent)).toEqual(['Options', 'Add number', 'Add below', 'Delete', 'More']);
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Add number' }));
    expect(fieldsOf(session)).toEqual(['major', 'severe', '']);
    expect(session.steps).toBe(1);

    const removes = screen.getAllByRole('button', { name: /^Remove / });
    expect(removes.map((button) => button.getAttribute('aria-label'))).toEqual(['Remove Major', 'Remove Severe', 'Remove Number']);
    expect(removes.every((button) => button.tabIndex === -1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Severe' }));
    expect(fieldsOf(session)).toEqual(['major', '']);
    expect(session.steps).toBe(2);
  });

  it('offers no × on its last number', () => {
    const session = new FakeSession(withMetric({ ...THRESHOLDS, fields: ['major'] }));
    const frame = setup(session);
    fireEvent.click(frame('metric01'));
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toEqual([]);
  });

  it('renames the number double-clicked, and Tab goes on to the next number', () => {
    const session = new FakeSession(withMetric({ ...THRESHOLDS, fields: ['major', ''] }));
    const frame = setup(session);
    const names = frame('metric01').querySelectorAll<HTMLElement>('.atlas-sb-metric__number .atlas-sb-label');
    fireEvent.doubleClick(names[0]!);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(input.value).toBe('Major');
    fireEvent.change(input, { target: { value: 'Minor' } });
    act(() => { fireEvent.keyDown(input, { key: 'Tab' }); });
    expect(session.template.fields.find((field) => field.key === 'major')?.label).toBe('Minor');
    const next = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(next.value).toBe('Number');
    fireEvent.change(next, { target: { value: 'Severe' } });
    fireEvent.keyDown(next, { key: 'Enter' });
    expect(fieldsOf(session)).toEqual(['major', 'severe']);
    expect(session.steps).toBe(2);
  });

  it('renames its group where it is double-clicked outside its numbers', () => {
    const session = new FakeSession(withMetric());
    const frame = setup(session);
    fireEvent.doubleClick(frame('metric01').querySelector('.atlas-sb-metric__heading')!);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(input.value).toBe('Thresholds');
    fireEvent.change(input, { target: { value: 'Damage thresholds' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(metricBlock(session.template, 'metric01')?.heading).toBe('Damage thresholds');
  });
});
