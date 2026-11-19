import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import css from '../../styles/main.scss?inline';
import { allBuiltInTemplates } from '../../src/app/statblocks/library/builtInTemplates';
import { flattenReadingOrder } from '../../src/app/statblocks/model/treeQueries';
import type { BuiltInTemplate, EntriesBlock, FieldValue } from '../../src/app/statblocks/model/templateTypes';
import { entryNameKey, entryTextKey } from '../../src/app/statblocks/values/entryValues';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { THEME, frames } from './sidePanesHarness';

// The roll's way to a map reaches the map view, whose Node `events` has no browser build; nothing here rolls.
vi.mock('../../src/app/services/statblockRolls', () => ({ rollStatblockDice: () => null, statblockRollingDice: () => null }));
vi.mock('../../src/app/services/statblockHitPoints', () => ({ rollHitPoints: () => undefined }));

/** A monospace face (the report's), a serif and a sans-serif. `monospace` twice keeps Chromium from shrinking the size. */
const FONTS = ['monospace, monospace', 'serif', 'sans-serif'];
/** Entries as the report wrote them: one starting with dice, one padded with a space by hand. */
const ENTRIES = [
  { name: 'Club', text: '+2 to hit, 1d4 bludgeoning damage' },
  { name: 'Sacred Flame', text: ' The target must pass a DC 12 DEX save or take 1d8 radiant damage' },
];
const h = React.createElement;

/** The built-ins' lists whose names run in before their text. */
function runInLists(builtIn: BuiltInTemplate): EntriesBlock[] {
  return flattenReadingOrder(builtIn.template.layout.blocks)
    .filter((block): block is EntriesBlock => block.type === 'entries' && block.nameStyle !== 'heading');
}

function valuesFor(builtIn: BuiltInTemplate, lists: readonly EntriesBlock[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = { name: 'Acolyte' };
  for (const list of lists) {
    const shape = builtIn.template.fields.find((field) => field.key === list.field)?.entry;
    values[list.field] = ENTRIES.map(({ name, text }) => ({ [entryNameKey(shape)]: name, [entryTextKey(shape)]: text }));
  }
  return values;
}

/** The box of the first character of an entry's text that is no space. */
function firstGlyph(trait: Element): DOMRect {
  const name = trait.querySelector('.atlas-sb-trait-name')!;
  const walker = document.createTreeWalker(trait, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (name.contains(node)) continue;
    const at = node.textContent!.search(/\S/);
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    return range.getBoundingClientRect();
  }
  throw new Error('entry without text');
}

/** How wide a word space is in the font an entry's text is set in. */
function spaceWidth(trait: Element): number {
  const context = document.createElement('canvas').getContext('2d')!;
  const style = getComputedStyle(trait);
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return context.measureText(' ').width;
}

/**
 * Report #652: a run-in name ("Club") stood a margin of 0.3em before its text,
 * which in a monospace face (whose word space is twice as wide) read as no gap,
 * and a text padded with a space by hand stood further off than the others.
 * With the real stylesheet, in every built-in whose lists run names in, the
 * name and its text are a word space of the text's own font apart.
 */
describe('the gap after a run-in entry name', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(() => {
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.replaceChildren();
  });

  const cases = allBuiltInTemplates()
    .filter((builtIn) => runInLists(builtIn).length > 0)
    .flatMap((builtIn) => FONTS.map((font) => [builtIn.id, font, builtIn] as const));

  it('runs names in in some built-ins', () => {
    expect(cases.map(([id]) => id)).toContain('builtin:5e-2024-monster');
  });

  it.each(cases)('%s in %s: a word space, also after a text padded by hand', async (_id, font, builtIn) => {
    const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    host.style.width = '640px';
    host.style.fontFamily = font;
    render(h(StatblockSheet, { template: builtIn.template, name: builtIn.name, fields: valuesFor(builtIn, runInLists(builtIn)), variant: 'full' }), { container: host });
    await act(async () => { await frames(2); });

    const traits = [...host.querySelectorAll('.atlas-sb-trait--run-in')].filter((trait) => trait.getBoundingClientRect().width > 0);
    expect(traits.length).toBeGreaterThanOrEqual(ENTRIES.length);
    for (const trait of traits) {
      const gap = firstGlyph(trait).left - trait.querySelector('.atlas-sb-trait-name')!.getBoundingClientRect().right;
      expect(gap).toBeCloseTo(spaceWidth(trait), 0);
      expect(trait.textContent).toMatch(/^(Club|Sacred Flame) \S/);
    }
  });
});
