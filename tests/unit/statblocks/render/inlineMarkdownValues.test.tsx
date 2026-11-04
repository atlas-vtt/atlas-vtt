// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { MarkdownRenderer, type App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { hasInlineMarkup } from '../../../../src/app/statblocks/render/shared/inlineMarkdown';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

/**
 * Obsidian's renderer, for the inline Markdown a value holds: `**bold**`,
 * `*italic*` and `[[Note]]` / `[[Note|alias]]` as Obsidian draws them, in a paragraph.
 */
function fakeObsidianMarkdown(markdown: string): string {
  return `<p>${markdown
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$2</a>')
    .replace(/\[\[([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')}</p>`;
}

const FIELDS: TemplateField[] = [
  { key: 'senses', label: 'Senses', type: 'text' },
  { key: 'gear', label: 'Gear', type: 'scores', slots: ['Item', 'Damage'] },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'range', label: 'Range', type: 'text' }] } },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'senses01', type: 'stat', field: 'senses' },
  { id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' },
  { id: 'actions1', type: 'entries', field: 'actions' },
];
const template = templateOf(FIELDS, BLOCKS);

let openLinkText: Mock<(target: string, source: string, pane: unknown) => Promise<void>>;
let trigger: Mock<(name: string, data: Record<string, unknown>) => void>;
let app: App;

beforeEach(() => {
  openLinkText = vi.fn(() => Promise.resolve());
  trigger = vi.fn();
  app = { workspace: { openLinkText, trigger } } as unknown as App;
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
    el.insertAdjacentHTML('beforeend', fakeObsidianMarkdown(markdown));
    return Promise.resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sheet(fields: Record<string, unknown>): HTMLElement {
  return renderSheet(template, fields, { app, sourcePath: 'Bestiary/Goblin.md' }).container;
}

describe('inline Markdown in a statblock', () => {
  it('draws a value as a note draws it: marks, links with their alias, and dice that roll', () => {
    const value = blockEl(sheet({ senses: '**Keen** *smell*, [[Senses/Scent|scent]] 1d8' }), 'senses01')!;
    expect(value.querySelector('strong')?.textContent).toBe('Keen');
    expect(value.querySelector('em')?.textContent).toBe('smell');
    const link = value.querySelector('a.internal-link')!;
    expect(link.getAttribute('data-href')).toBe('Senses/Scent');
    expect(link.textContent).toBe('scent');
    expect(value.querySelector('.atlas-dice-link')?.textContent).toBe('1d8');
    // One line: Obsidian's paragraph is unwrapped.
    expect(value.querySelector('p')).toBeNull();
  });

  it('draws a table cell inline: a link, bold, italic, with no paragraph, and plain text with its dice linked', () => {
    const gear = blockEl(sheet({ gear: [['[[Longsword]]', '1d8 **slashing**'], ['*Rope*', '1d4']] }), 'gear0001')!;
    const cells = [...gear.querySelectorAll('td.atlas-sb-sheet-table__cell')];
    const link = cells[0]!.querySelector('a.internal-link')!;
    expect(link.getAttribute('data-href')).toBe('Longsword');
    expect(link.textContent).toBe('Longsword');
    expect(cells[1]!.querySelector('strong')?.textContent).toBe('slashing');
    expect(cells[2]!.querySelector('em')?.textContent).toBe('Rope');
    expect(gear.querySelector('p')).toBeNull();
    // A cell without Markdown is its text, its dice linked as in every value.
    expect(cells[3]!.textContent).toBe('1d4');
    expect(cells[3]!.querySelector('p, strong')).toBeNull();
    expect([...gear.querySelectorAll<HTMLElement>('.atlas-dice-link')].map((link) => link.dataset.formula)).toEqual(['1d8', '1d4']);
  });

  it("opens a cell's link on a click and shows Obsidian's page preview on hover, from the statblock's note", () => {
    const link = blockEl(sheet({ gear: [['[[Longsword]]', '']] }), 'gear0001')!.querySelector<HTMLElement>('a.internal-link')!;
    const hover = new MouseEvent('mouseover', { bubbles: true });
    act(() => { link.dispatchEvent(hover); });
    expect(trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({
      event: hover, source: 'preview', targetEl: link, linktext: 'Longsword', sourcePath: 'Bestiary/Goblin.md',
    }));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(openLinkText).toHaveBeenCalledWith('Longsword', 'Bestiary/Goblin.md', 'tab');
  });

  it("draws an ability's name and parts with their links", () => {
    const actions = blockEl(sheet({ actions: [{ name: '[[Claws|Rending claws]]', range: '[[Reach]] 5 ft.', desc: 'Hits.' }] }), 'actions1')!;
    expect(actions.querySelector('.atlas-sb-trait-name a.internal-link')?.textContent).toBe('Rending claws');
    expect(actions.querySelector('.atlas-sb-entry-extra a.internal-link')?.getAttribute('data-href')).toBe('Reach');
  });

  it('draws text without Markdown through no renderer', () => {
    for (const text of ['Longsword', '1d8 slashing', '+3', '—', '18 (+4)']) expect(hasInlineMarkup(text)).toBe(false);
    for (const text of ['[[Longsword]]', '**x**', '*x*', '`x`', '~~x~~', '==x==', 'https://example.com', '#tag']) expect(hasInlineMarkup(text)).toBe(true);
  });
});
