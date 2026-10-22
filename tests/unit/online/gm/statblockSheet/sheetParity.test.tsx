// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, type BookStatblock, type SheetNode, type SheetValue } from '../../../../../src/app/online/protocol/index.ts';
import { allBuiltInTemplates } from '../../../../../src/app/statblocks/library/builtInTemplates';
import { sampleRecord } from '../../../../../src/app/statblocks/model/sampleValues';
import { flattenReadingOrder } from '../../../../../src/app/statblocks/model/treeQueries';
import { StatblockSheet } from '../../../../../src/app/statblocks/render/StatblockSheet';
import { resolvedOf, statblockTexts, wordsOf } from './sheetKit';

/** The words of the card as Atlas draws it for a reader. */
function cardWords(template: Parameters<typeof StatblockSheet>[0]['template'], fields: Record<string, unknown>): Set<string> {
  const { container, unmount } = render(<StatblockSheet template={template} fields={fields} name="Parity" variant="full" />);
  const texts: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node.textContent ?? '');
  unmount();
  return wordsOf(texts);
}

const collapsed = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** What the card writes for each of its Values and pairs lists (`.atlas-sb-value`), worked-out ones included. */
function cardValueTexts(template: Parameters<typeof StatblockSheet>[0]['template'], fields: Record<string, unknown>): string[] {
  const { container, unmount } = render(<StatblockSheet template={template} fields={fields} name="Parity" variant="full" />);
  const texts = flattenReadingOrder(template.layout.blocks)
    .filter((block) => block.type === 'stat' || block.type === 'pairs')
    .map((block) => collapsed(container.querySelector(`[data-block-id="${block.id}"] .atlas-sb-value`)?.textContent ?? ''))
    .filter((text) => text !== '');
  unmount();
  return texts;
}

function sheetValues(nodes: readonly SheetNode[]): SheetValue[] {
  return nodes.flatMap((node): SheetValue[] => {
    switch (node.k) {
      case 'section': case 'row': return sheetValues(node.nodes);
      case 'tabs': return node.tabs.flatMap((tab) => sheetValues(tab.nodes));
      case 'value': return [node.value];
      case 'metric': return node.values;
      default: return [];
    }
  });
}

/** What the sheet writes for each value: its text, and a pairs list's pairs as the page lists them. */
function sheetValueTexts(statblock: BookStatblock): Set<string> {
  const values = [...Object.values(statblock.sigils), ...sheetValues(statblock.blocks)];
  return new Set(values.flatMap((value) => [collapsed(value.text.opening), ...(value.pairs ? [value.pairs.map((pair) => `${pair.label} ${pair.value}`).join(', ')] : [])]));
}

describe('a player\'s sheet and the Atlas card', () => {
  for (const builtIn of allBuiltInTemplates()) {
    it(`show the same text for ${builtIn.name}`, () => {
      const fields = sampleRecord(builtIn.template);
      const statblock = statblockSheet({ resolved: resolvedOf(builtIn.template, fields), definitions: [], resources: undefined });
      expect(statblock).not.toBeNull();
      expect(parseBookStatblock(statblock)).toEqual(statblock);
      const card = cardWords(builtIn.template, fields);
      const sheet = wordsOf(statblockTexts(statblock!));
      const unnamed = wordsOf(statblockTexts(statblock!, false));
      expect([...card].filter((word) => !sheet.has(word)), 'on the card, not on the sheet').toEqual([]);
      expect([...unnamed].filter((word) => !card.has(word)), 'on the sheet, not on the card').toEqual([]);
      const shown = sheetValueTexts(statblock!);
      expect(cardValueTexts(builtIn.template, fields).filter((text) => !shown.has(text)), 'a value the sheet writes otherwise').toEqual([]);
    });
  }
});
