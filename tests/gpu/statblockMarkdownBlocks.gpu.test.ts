import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { StatblockPreviewWindow } from '../../src/app/services/StatblockPreviewWindow';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { LinkedStatblock } from '../../src/app/statblocks/render/LinkedStatblock';
import { addNote, creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { renderObsidianBlocks } from '../unit/statblocks/render/obsidianBlocks';
import { THEME, frames } from './sidePanesHarness';

// The roll's way to a map reaches the map view, whose Node `events` has no browser build; nothing here rolls.
vi.mock('../../src/app/services/statblockRolls', () => ({ rollStatblockDice: () => null, statblockRollingDice: () => null }));
vi.mock('../../src/app/services/statblockHitPoints', () => ({ rollHitPoints: () => undefined }));

const NOTE = 'Bestiary/Trap.md';
/** Reports #685 and #703: an entry of two paragraphs, one of a line and a list, then entries and a block after them. */
const VALUES = {
  statblock: true,
  'atlas-template': 'builtin:generic-creature',
  name: 'Test Trap',
  level: 1,
  senses: 'tremorsense 30 ft.',
  traits: [
    { name: 'Hidden Trap!', desc: 'When a creature steps into the area, DEX save:' },
    { name: '15+.', desc: 'Leap harmlessly across.\n\n*Escape.* Standing up costs 3 spaces of movement.' },
    { name: 'Failure.', desc: 'The creature falls:\n- It lands prone\n- It takes 1d6 damage' },
    { name: 'Reset.', desc: 'The trap resets at dawn.' },
  ],
  actions: [{ name: 'Snap.', desc: 'Melee attack: 1d8 piercing damage.' }],
};
/** Displays that make a box of its own lines: a child of an inline box that has one is a block inside an inline box. */
const BLOCK_LEVEL = new Set(['block', 'list-item', 'flow-root', 'flex', 'grid', 'table']);
const h = React.createElement;

/** The elements of the card that are block-level inside an inline box, by tag and parent. */
function blocksInInlineBoxes(card: Element): string[] {
  return [...card.querySelectorAll('*')].filter((el) => {
    const parent = el.parentElement;
    return parent !== null && BLOCK_LEVEL.has(getComputedStyle(el).display) && getComputedStyle(parent).display === 'inline';
  }).map((el) => `${el.tagName.toLowerCase()} in ${el.parentElement!.tagName.toLowerCase()}.${el.parentElement!.className}`);
}

/** The box of the first character of an element's own text. */
function firstGlyph(el: Element): DOMRect {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode()!;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 1);
  return range.getBoundingClientRect();
}

/**
 * Reports #685 and #703: Obsidian draws a description of several paragraphs,
 * or a line with a list, as blocks inside the inline element the text stands
 * in. The Chromium of older Obsidian installers (130, Electron 33) sets such a
 * block, and every block of the card after it, into a column beyond the card:
 * the entry's text was missing from the preview, or the whole section gone
 * from the card. With the real stylesheet, no block stands inside an inline
 * box, the first paragraph runs on after the name, the rest stands under it,
 * and everything lies inside the card.
 */
describe('statblock text of several blocks in the card', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let vault: CreatureVault;

  beforeEach(async () => {
    await page.viewport(1280, 800);
    document.head.append(style);
    renderObsidianBlocks();
    vault = creatureVault();
    addNote(vault, NOTE, VALUES);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    TemplateLibrary.release(vault.app);
    style.remove();
    document.body.replaceChildren();
  });

  function check(card: HTMLElement): void {
    const box = card.getBoundingClientRect();
    expect(blocksInInlineBoxes(card)).toEqual([]);

    const traits = [...card.querySelectorAll<HTMLElement>('[data-prop="traits"] .atlas-sb-trait')];
    expect(traits.map((trait) => trait.querySelector('.atlas-sb-trait-name')!.textContent)).toEqual(['Hidden Trap!', '15+.', 'Failure.', 'Reset.']);
    const [, paragraphs, list] = traits.map((trait) => [...trait.querySelectorAll<HTMLElement>('.atlas-sb-markdown')].at(-1)!);

    // The first paragraph runs on in the name's line; the second is a line of its own under it, as wide as the entry.
    const name = paragraphs!.closest('.atlas-sb-trait')!.querySelector('.atlas-sb-trait-name')!.getBoundingClientRect();
    const start = firstGlyph(paragraphs!);
    expect(Math.abs(start.top - name.top)).toBeLessThan(4);
    expect(start.left).toBeGreaterThan(name.right);
    const second = paragraphs!.querySelector(':scope > p')!.getBoundingClientRect();
    const entry = paragraphs!.closest('.atlas-sb-trait')!.getBoundingClientRect();
    expect(second.top).toBeGreaterThanOrEqual(start.bottom);
    expect(second.top - start.bottom).toBeLessThan(16);
    expect(second.left).toBeCloseTo(entry.left, 0);
    expect(second.width).toBeCloseTo(entry.width, 0);

    // A list under its line, its marker inside the entry.
    const items = list!.querySelector(':scope > ul')!.getBoundingClientRect();
    expect(items.top).toBeGreaterThanOrEqual(firstGlyph(list!).bottom);
    expect(items.left).toBeGreaterThanOrEqual(entry.left - 0.5);
    expect(items.right).toBeLessThanOrEqual(entry.right + 0.5);

    // Everything the card holds lies inside it, in reading order: nothing went to a column beyond it.
    const parts = [...card.querySelectorAll<HTMLElement>('.atlas-sb-trait, .atlas-sb-markdown > p, .atlas-sb-markdown > ul, .atlas-sb-section-heading')];
    expect(parts.length).toBeGreaterThanOrEqual(8);
    for (const part of parts) {
      const rect = part.getBoundingClientRect();
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.left).toBeGreaterThanOrEqual(box.left);
      expect(rect.right).toBeLessThanOrEqual(box.right + 0.5);
      expect(rect.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
    }
    const body = card.querySelector<HTMLElement>('.atlas-statblock-body')!;
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  }

  it('in the Mod-hover preview of a token (one column)', async () => {
    const preview = new StatblockPreviewWindow(vault.app, NOTE, {}, null, { x: 600, y: 700 });
    await vi.waitFor(() => expect(preview.element!.querySelector('[data-prop="actions"] .atlas-sb-trait')).not.toBeNull());
    await frames(4);
    const card = preview.element!.querySelector<HTMLElement>('.atlas-statblock')!;
    check(card);
    // The window holds the whole statblock, inside the screen.
    const body = card.querySelector<HTMLElement>('.atlas-statblock-body')!;
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    expect(preview.element!.getBoundingClientRect().bottom).toBeLessThanOrEqual(800);
    preview.hide(true);
  });

  it('in a card wide enough for two columns', async () => {
    const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    host.style.width = '900px';
    render(h(LinkedStatblock, { app: vault.app, path: NOTE, variant: 'full' }), { container: host });
    await vi.waitFor(() => expect(host.querySelector('[data-prop="actions"] .atlas-sb-trait')).not.toBeNull());
    await frames(4);
    const card = host.querySelector<HTMLElement>('.atlas-statblock')!;
    check(card);
    // Two columns: the last block starts right of the first.
    const columns = [...card.querySelectorAll<HTMLElement>('.atlas-sb-columns > .atlas-sb-item')].map((item) => item.getBoundingClientRect().left);
    expect(Math.max(...columns)).toBeGreaterThan(Math.min(...columns) + 100);
  });
});
