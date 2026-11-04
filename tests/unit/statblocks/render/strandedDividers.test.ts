import { describe, expect, it } from 'vitest';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { strandedDividers } from '../../../../src/app/statblocks/render/strandedDividers';

const rule = (id: string): TemplateBlock => ({ id, type: 'divider' });
const stat = (id: string): TemplateBlock => ({ id, type: 'stat', field: id, look: 'run-in' });

/** The stranded rules of `blocks` where the blocks named in `hidden` do not show. */
function stranded(blocks: TemplateBlock[], hidden: string[] = []): string[] {
  return [...strandedDividers(blocks, (block) => !hidden.includes(block.id))].sort();
}

describe('strandedDividers', () => {
  it('drops a rule that hidden blocks leave right under another rule', () => {
    expect(stranded([stat('a'), rule('r1'), stat('b'), stat('c'), rule('r2'), stat('d')], ['b', 'c'])).toEqual(['r2']);
  });

  it('drops a rule that hidden blocks leave at the end or the start of its list', () => {
    expect(stranded([stat('a'), rule('r1'), stat('b')], ['b'])).toEqual(['r1']);
    expect(stranded([stat('a'), rule('r1'), stat('b')], ['a'])).toEqual(['r1']);
  });

  it('drops every rule of a run that ends the list once the blocks between them hide', () => {
    expect(stranded([stat('a'), rule('r1'), stat('b'), rule('r2'), stat('c')], ['b', 'c'])).toEqual(['r1', 'r2']);
  });

  it('keeps rules the template places side by side or at an edge itself', () => {
    expect(stranded([rule('r0'), stat('a'), rule('r1'), rule('r2'), stat('b'), rule('r3')])).toEqual([]);
  });

  it('keeps a rule that still stands between shown blocks', () => {
    expect(stranded([stat('a'), stat('b'), rule('r1'), stat('c'), stat('d')], ['b', 'c'])).toEqual([]);
  });
});
