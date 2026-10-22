// @vitest-environment jsdom
import { cleanup, fireEvent, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { turnInto } from '../../../../src/app/statblocks/model/turnInto';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate } from './editorKit';
import { mountEditor, tileOptions } from './sidePanesKit';

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

const blockOf = (template: StatblockTemplate, id: string): TemplateBlock | undefined => findBlock(template.layout.blocks, id)?.block;

/** The sample template with a Metric of two numbers and a list of labels and values after its values. */
function withNumbers(): StatblockTemplate {
  const sample = sampleTemplate();
  return {
    ...sample,
    fields: [
      ...sample.fields,
      { key: 'major', label: 'Major', type: 'number' }, { key: 'severe', label: 'Severe', type: 'number' },
      { key: 'experiences', label: 'Experiences', type: 'pairs' },
    ],
    layout: {
      ...sample.layout,
      blocks: [
        ...sample.layout.blocks,
        { id: 'metric01', type: 'metric', heading: 'Thresholds', fields: ['major', 'severe'] },
        { id: 'pairs001', type: 'pairs', field: 'experiences' },
      ],
    },
  };
}

describe('the Add to next roll option', () => {
  it('is a switch in the Options of a number, a Metric and labels with values, one step each, and off removes the key', () => {
    const session = new FakeSession(withNumbers());
    const { frame } = mountEditor(session);
    for (const id of ['stat-ac1', 'metric01', 'pairs001']) {
      fireEvent.click(frame(id));
      const steps = session.steps;
      const toggle = within(tileOptions()).getByRole('switch', { name: 'Add to next roll' });
      fireEvent.click(toggle);
      expect(blockOf(session.template, id)).toMatchObject({ addsToRolls: true });
      expect(session.steps).toBe(steps + 1);
      fireEvent.click(within(tileOptions()).getByRole('switch', { name: 'Add to next roll' }));
      expect(blockOf(session.template, id)).not.toHaveProperty('addsToRolls');
      fireEvent.keyDown(tileOptions(), { key: 'Escape' });
    }
  });

  it('is not offered for a value that holds no number', () => {
    const { frame } = mountEditor(new FakeSession(withNumbers()));
    fireEvent.click(frame('stat-sp1'));
    expect(within(tileOptions()).queryByRole('switch', { name: 'Add to next roll' })).toBeNull();
  });

  it('is kept when a number turns into labels with values and back', () => {
    const template = withNumbers();
    const turned = turnInto(
      { ...template.layout, blocks: [{ id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in', addsToRolls: true }] }, 'stat-ac1', 'pairs', template.fields,
    );
    expect(turned.ok && blockOf({ ...template, layout: turned.layout }, 'stat-ac1')).toMatchObject({ type: 'pairs', addsToRolls: true });
  });
});

describe('Add to next roll in a template file', () => {
  const file = (block: Record<string, unknown>): string => JSON.stringify({
    format: 'atlas-statblock-template', version: 1, id: 'adds-to-rolls-abc123',
    fields: [{ key: 'proficiency', label: 'Proficiency', type: 'number' }],
    layout: { maxColumns: 1, blocks: [{ id: 'prof0001', type: 'stat', field: 'proficiency', look: 'run-in', ...block }] },
  });

  it('is written only while on, after the block\'s own keys, and read back', () => {
    const read = parseTemplate(file({ addsToRolls: true })).template!;
    expect(blockOf(read, 'prof0001')).toMatchObject({ addsToRolls: true });
    const written = serializeTemplate(read);
    expect(Object.keys(JSON.parse(written).layout.blocks[0]).at(-1)).toBe('addsToRolls');
    expect(JSON.parse(written).layout.blocks[0]).toStrictEqual({ id: 'prof0001', type: 'stat', field: 'proficiency', look: 'run-in', addsToRolls: true });
    expect(serializeTemplate(parseTemplate(written).template!)).toBe(written);
  });

  it('keeps a value it cannot read as written, and reads it as off', () => {
    const read = parseTemplate(file({ addsToRolls: 'yes' }));
    expect(blockOf(read.template!, 'prof0001')).not.toHaveProperty('addsToRolls');
    expect(JSON.parse(serializeTemplate(read.template!)).layout.blocks[0].addsToRolls).toBe('yes');
  });
});
