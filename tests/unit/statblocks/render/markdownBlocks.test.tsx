// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { renderObsidianBlocks } from './obsidianBlocks';
import { blockEl, blockText, renderSheet, templateOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'tactics', label: 'Tactics', type: 'markdown' },
  { key: 'actions', label: 'Actions', type: 'entries' },
  { key: 'senses', label: 'Senses', type: 'text' },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'tactics1', type: 'text', field: 'tactics' },
  { id: 'actions1', type: 'entries', field: 'actions', heading: 'Actions' },
  { id: 'senses01', type: 'stat', field: 'senses', look: 'run-in' },
];
const template = templateOf(FIELDS, BLOCKS);
const app = { workspace: { openLinkText: () => Promise.resolve(), trigger: () => undefined } } as unknown as App;

/** Report #685's entry: two paragraphs. */
const TWO_PARAGRAPHS = 'Leap harmlessly across.\n\n*Escape.* Standing up costs 3 spaces of movement.';
/** The report's other shape: a list under a line. */
const LINE_AND_LIST = 'On a failure:\n- Fall prone\n- Take 1d6 damage';

beforeEach(() => {
  renderObsidianBlocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sheet(fields: Record<string, unknown>): HTMLElement {
  return renderSheet(template, fields, { app, sourcePath: 'Bestiary/Trap.md' }).container;
}

/** The elements Obsidian's Markdown was drawn into, in a block. */
function drawn(container: HTMLElement, blockId: string): HTMLElement[] {
  return [...blockEl(container, blockId)!.querySelectorAll<HTMLElement>('.atlas-sb-markdown')];
}

/** The text that stands in the element's own line: its nodes before its first block. */
function runsOn(el: HTMLElement): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('p, ul')) break;
    text += node.textContent ?? '';
  }
  return text;
}

describe('statblock text of several blocks', () => {
  it("runs an entry's first paragraph on after its name and keeps the next one a paragraph under it", () => {
    const container = sheet({ actions: [{ name: 'Hidden Trap!', desc: 'DEX save:' }, { name: '15+.', desc: TWO_PARAGRAPHS }] });
    const text = drawn(container, 'actions1').at(-1)!;
    expect(text.closest('.atlas-sb-trait')!.querySelector('.atlas-sb-trait-name')!.textContent).toBe('15+.');
    expect(runsOn(text)).toBe('Leap harmlessly across.');
    // What follows is the text's own child, where the stylesheet sets it as a line of its own.
    const blocks = [...text.children].filter((child) => child.matches('p, ul'));
    expect(blocks.map((block) => block.tagName)).toEqual(['P']);
    expect(blocks[0]!.textContent).toBe('Escape. Standing up costs 3 spaces of movement.');
    expect(blocks[0]!.parentElement).toBe(text);
  });

  it('keeps a list under the line it follows, its dice linked', () => {
    const text = drawn(sheet({ actions: [{ name: 'Pit.', desc: LINE_AND_LIST }] }), 'actions1').at(-1)!;
    expect(runsOn(text)).toBe('On a failure:');
    expect([...text.querySelectorAll(':scope > ul > li')].map((item) => item.textContent)).toEqual(['Fall prone', 'Take 1d6 damage']);
    expect(text.querySelector<HTMLElement>('li .atlas-dice-link')?.dataset.formula).toBe('1d6');
  });

  it('draws a Text block of several paragraphs the same way', () => {
    const [text] = drawn(sheet({ tactics: 'It waits.\n\nThen it strikes.\n\nIt never flees.' }), 'tactics1');
    expect(runsOn(text!)).toBe('It waits.');
    expect([...text!.querySelectorAll(':scope > p')].map((paragraph) => paragraph.textContent)).toEqual(['Then it strikes.', 'It never flees.']);
  });

  it('leaves text of one paragraph inline, with no paragraph around it', () => {
    const [text] = drawn(sheet({ actions: [{ name: 'Bite.', desc: 'Melee *attack*: 1d6.' }] }), 'actions1');
    expect(text!.textContent).toBe('Melee attack: 1d6.');
    expect(text!.querySelector('p')).toBeNull();
  });

  it('shows every block after an entry of several paragraphs', () => {
    const container = sheet({ actions: [{ name: '15+.', desc: TWO_PARAGRAPHS }, { name: 'Bite.', desc: 'It bites.' }], senses: 'darkvision 60 ft.' });
    expect(blockText(container, 'actions1')).toContain('Bite. It bites.');
    expect(blockText(container, 'senses01')).toContain('darkvision 60 ft.');
  });

  it('draws the entries of a list that also holds values that are no entries', () => {
    const odd = [null, 7, '', {}, [], ['Claw', 'It claws.'], { desc: TWO_PARAGRAPHS }, 'Plain text.', { name: 'Bite.', desc: 'It bites.' }];
    const container = sheet({ actions: odd, senses: 'darkvision 60 ft.' });
    const text = blockText(container, 'actions1');
    for (const part of ['Actions', '7', 'Claw', 'It claws.', 'Leap harmlessly across.', 'Plain text.', 'Bite. It bites.']) expect(text).toContain(part);
    expect(blockText(container, 'senses01')).toContain('darkvision 60 ft.');
  });
});
