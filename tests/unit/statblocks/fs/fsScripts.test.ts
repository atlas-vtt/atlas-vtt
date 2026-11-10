import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { fsLayoutToTemplate, suggestedTrackReplacement } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import { scriptSummary } from '../../../../src/app/statblocks/fs/fsScripts';
import { insertBlock, removeBlock } from '../../../../src/app/statblocks/model/treeOps';
import { blockIdSource, type BlockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import { collectBlockIds, findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { ScriptBlock, StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { BEAST_LAYOUT } from './fixtures/syntheticLayouts';

function counting(): BlockIdSource {
  let next = 0;
  return () => `track${String(next++).padStart(3, '0')}`;
}

function scriptOf(template: StatblockTemplate, blockId: string): ScriptBlock {
  const found = findBlock(template.layout.blocks, blockId)?.block;
  if (found?.type !== 'script') throw new Error(`no script ${blockId}`);
  return found;
}

describe('suggestedTrackReplacement', () => {
  const { template, report } = fsLayoutToTemplate(BEAST_LAYOUT, { id: 'synthetic-beast-abc123' });

  it('offers a Track block per key a script counts checkboxes to', () => {
    const note = report.scripts.find((script) => script.suggestion === 'track');
    if (!note) throw new Error('no track suggestion');
    expect(suggestedTrackReplacement(scriptOf(template, note.blockId), counting())).toEqual({
      blocks: [
        { id: 'track000', type: 'track', field: 'hp', resource: 'hp', look: 'boxes', counts: 'down' },
        { id: 'track001', type: 'track', field: 'wounds', resource: 'wounds', look: 'boxes', counts: 'up' },
      ],
      fields: [
        { key: 'hp', label: 'Hit points', type: 'number' },
        { key: 'wounds', label: 'Wounds', type: 'number' },
      ],
    });
  });

  it('offers nothing for other scripts', () => {
    for (const note of report.scripts.filter((script) => script.suggestion === null)) {
      expect(suggestedTrackReplacement(scriptOf(template, note.blockId), counting())).toBeNull();
    }
  });

  it('gives blocks that replace the script into a template that parses', () => {
    const note = report.scripts.find((script) => script.suggestion === 'track');
    if (!note) throw new Error('no track suggestion');
    const replacement = suggestedTrackReplacement(scriptOf(template, note.blockId), blockIdSource(collectBlockIds(template.layout.blocks)));
    if (!replacement) throw new Error('no replacement');
    const place = findBlock(template.layout.blocks, note.blockId);
    if (!place) throw new Error('no place');
    const removed = removeBlock(template.layout, note.blockId);
    expect(removed.ok).toBe(true);
    let layout = removed.layout;
    replacement.blocks.forEach((block, offset) => {
      const inserted = insertBlock(layout, block, { parentId: place.parentId, index: place.index + offset });
      expect(inserted.ok).toBe(true);
      layout = inserted.layout;
    });
    const known = new Set(template.fields.map((field) => field.key));
    const fields = [...template.fields, ...replacement.fields.filter((field) => !known.has(field.key))];
    const parsed = parseTemplate({ ...template, fields, layout });
    expect(parsed.status).toBe('ok');
    expect(parsed.problems).toEqual([]);
  });
});

describe('scriptSummary', () => {
  it.each([
    [{ type: 'javascript', code: 'return monster.a + monster.b + monster.c + monster.d;' }, 'JavaScript reading a, b, c and more'],
    [{ type: 'javascript', code: 'return createDiv();' }, 'JavaScript'],
    [{ type: 'action', icon: 'dice' }, 'A button'],
    [{ type: 'ifelse', conditions: [{ condition: 'return true', nested: [] }] }, 'A part shown when JavaScript allows it'],
    [{ type: 'property', properties: [], callback: 'return 1' }, 'A block formatted by JavaScript'],
    [{ type: 'property', properties: [], callback: 'return [monster.rarity, monster.size].map(f).join(" ")' }, 'Rarity and size formatted by JavaScript'],
  ])('describes %j', (record, summary) => {
    expect(scriptSummary(record, undefined)).toBe(summary);
  });
});
