// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';


import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { BlockChromeContext, type BlockChrome } from '../../../../src/app/statblocks/render/blockChrome';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { blockEl, renderSheet, templateOf, valueOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'speed', label: 'Speed', type: 'text', prompt: 'Add speed' },
  { key: 'ac', label: 'Armor', type: 'number', unit: 'pts' },
  { key: 'kind', label: 'Kind', type: 'text' },
  { key: 'traits', label: 'Traits', type: 'entries' },
];

const BLOCKS: TemplateBlock[] = [
  { id: 'title000', type: 'title', field: 'name', level: 1 },
  { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in' },
  { id: 'armor000', type: 'stat', field: 'ac', look: 'stacked' },
  { id: 'spirit00', type: 'stat', field: 'kind', look: 'run-in', showWhen: { field: 'kind', is: 'equal', value: 'spirit' } },
  { id: 'section0', type: 'section', heading: 'Traits', blocks: [{ id: 'traits00', type: 'entries', field: 'traits' }] },
  { id: 'header00', type: 'heading', text: 'Notes', level: 'section' },
];

const TEMPLATE = templateOf(FIELDS, BLOCKS);

describe('StatblockSheet: showing and hiding', () => {
  it('hides blocks whose fields are empty, and a section whose blocks all hide', () => {
    const { container } = renderSheet(TEMPLATE, { name: 'Wisp' });
    expect(blockEl(container, 'speed000')).toBeNull();
    expect(blockEl(container, 'section0')).toBeNull();
    expect(blockEl(container, 'header00')).not.toBeNull();
  });

  it('draws no rule that hidden blocks leave under another rule or at the end', () => {
    const template = templateOf(FIELDS, [
      { id: 'title000', type: 'title', field: 'name', level: 1 },
      { id: 'rule0000', type: 'divider' },
      { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in' },
      { id: 'rule0001', type: 'divider' },
      { id: 'armor000', type: 'stat', field: 'ac', look: 'stacked' },
      { id: 'rule0002', type: 'divider' },
      { id: 'kind0000', type: 'stat', field: 'kind', look: 'run-in' },
    ]);
    const { container } = renderSheet(template, { name: 'Wisp', ac: 3 });
    expect(blockEl(container, 'rule0000')).not.toBeNull();
    expect(blockEl(container, 'rule0001')).toBeNull();
    expect(blockEl(container, 'rule0002')).toBeNull();
  });

  it('writes a number with its unit', () => {
    const { container } = renderSheet(TEMPLATE, { name: 'Wisp', ac: 3 });
    expect(valueOf(container, 'armor000')).toBe('3 pts');
  });

  it('shows a block only while its condition holds', () => {
    const beast = renderSheet(TEMPLATE, { name: 'Wisp', kind: 'beast' });
    expect(blockEl(beast.container, 'spirit00')).toBeNull();
    beast.unmount();

    const spirit = renderSheet(TEMPLATE, { name: 'Wisp', kind: 'Spirit' });
    expect(valueOf(spirit.container, 'spirit00')).toBe('Spirit');
  });

  it('shows a fallback pattern in place of empty fields', () => {
    const template = templateOf(FIELDS, [
      { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in', whenEmpty: 'fallback', fallback: '{=ac * 10} ft.' },
    ]);
    const { container } = renderSheet(template, { ac: 3 });
    expect(valueOf(container, 'speed000')).toBe('30 ft.');
  });

  it('hides a fallback that writes nothing', () => {
    const template = templateOf(FIELDS, [
      { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in', whenEmpty: 'fallback', fallback: '{ac}' },
    ]);
    const { container } = renderSheet(template, {});
    expect(blockEl(container, 'speed000')).toBeNull();
  });
});

describe('StatblockSheet: problems of the template', () => {
  it('marks a pattern that cannot be read, and still shows the field', () => {
    const template = templateOf(FIELDS, [{ id: 'speed000', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed' }]);
    const { container } = renderSheet(template, { speed: '30 ft.' });
    expect(valueOf(container, 'speed000')).toBe('30 ft.');
    expect(blockEl(container, 'speed000')!.querySelector('.atlas-sb-problem')).not.toBeNull();
  });

  it('marks a formula over a value that is not a number', () => {
    const template = templateOf(FIELDS, [{ id: 'speed000', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed} ({=speed * 2})' }]);
    const { container } = renderSheet(template, { speed: '30 ft.' });
    expect(blockEl(container, 'speed000')!.querySelector('.atlas-sb-problem')).not.toBeNull();
  });

  it('never marks an empty field', () => {
    const template = templateOf(FIELDS, [{ id: 'speed000', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed}[ ({=ac * 2})]' }]);
    const { container } = renderSheet(template, { speed: '30 ft.' });
    expect(valueOf(container, 'speed000')).toBe('30 ft.');
    expect(container.querySelector('.atlas-sb-problem')).toBeNull();
  });
});

describe('StatblockSheet: editing mode', () => {
  it('shows prompts where values are empty instead of hiding the blocks', () => {
    const { container } = renderSheet(TEMPLATE, {}, { mode: 'editing' });
    expect(blockEl(container, 'speed000')!.querySelector('.atlas-sb-prompt')?.textContent).toBe('Add speed');
    expect(blockEl(container, 'armor000')!.querySelector('.atlas-sb-prompt')?.textContent).toBe('Add armor');
    expect(blockEl(container, 'speed000')!.dataset.state).toBe('prompt');
    expect(blockEl(container, 'section0')).not.toBeNull();
    expect(blockEl(container, 'traits00')!.querySelector('.atlas-sb-prompt')?.textContent).toBe('Add traits');
  });

  it('still follows conditions', () => {
    const { container } = renderSheet(TEMPLATE, { kind: 'beast' }, { mode: 'editing' });
    expect(blockEl(container, 'spirit00')).toBeNull();
  });
});

describe('StatblockSheet: chrome', () => {
  it('lets the template editor decorate frames, and the runtime card carries nothing of it', () => {
    const chrome: BlockChrome = {
      decorate: (block) => ({
        attributes: { 'data-selected': block.id === 'title000' ? 'true' : undefined },
        overlay: <span className="test-overlay" />,
      }),
    };
    const { container } = render(
      <BlockChromeContext.Provider value={chrome}>
        <StatblockSheet template={TEMPLATE} name="Test" variant="full" fields={{ name: 'Wisp' }} />
      </BlockChromeContext.Provider>,
    );
    expect(blockEl(container, 'title000')!.dataset.selected).toBe('true');
    expect(blockEl(container, 'title000')!.querySelector('.test-overlay')).not.toBeNull();

    const plain = renderSheet(TEMPLATE, { name: 'Wisp' });
    expect(blockEl(plain.container, 'title000')!.hasAttribute('data-selected')).toBe(false);
    expect(plain.container.querySelector('.test-overlay')).toBeNull();
  });
});
