import { describe, expect, it } from 'vitest';
import { FIVE_E_2024 } from '../../../fixtures/statblockTemplateFixtures';
import { blockDisplay, visibilityFields } from '../../../../src/app/statblocks/render/blockDisplay';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';

function block(id: string): TemplateBlock {
  const found = findBlock(FIVE_E_2024.layout.blocks, id);
  if (!found) throw new Error(`No block ${id}`);
  return found.block;
}

function state(record: Record<string, unknown>, mode: 'view' | 'editing' = 'view'): ReturnType<typeof sheetState> {
  return sheetState({ template: FIVE_E_2024, record, mode });
}

describe('visibilityFields', () => {
  it("counts a block's own pattern but not its fallback", () => {
    expect(visibilityFields(block('b5init00'))).toEqual(['initiative']);
    expect(visibilityFields(block('b5immu00'))).toEqual(['damage_immunities', 'condition_immunities']);
    expect(visibilityFields(block('b5hp0000'))).toEqual(['hp', 'hit_dice']);
  });
});

describe('blockDisplay', () => {
  it('gives the text a pattern block writes', () => {
    expect(blockDisplay(block('b5line00'), state({ size: 'Tiny', type: 'beast' }))).toEqual({
      state: 'value', text: { text: 'Tiny beast', problems: [] },
    });
  });

  it('gives the fallback where the fields are empty', () => {
    const display = blockDisplay(block('b5init00'), state({ stats: [10, 14] }));
    expect(display).toEqual({ state: 'fallback', text: { text: '+2 (12)', problems: [] } });
  });

  it('prompts "Add <label>" in lower case, keeping acronyms', () => {
    expect(blockDisplay(block('b5hp0000'), state({}, 'editing'))).toEqual({ state: 'prompt', prompt: 'Add HP' });
    expect(blockDisplay(block('b5immu00'), state({}, 'editing'))).toEqual({ state: 'prompt', prompt: 'Add damage immunities' });
  });

  it('says what a worked-out value comes from instead of asking for it', () => {
    const xp: TemplateBlock = { id: 'xpline00', type: 'stat', field: 'cr', label: 'XP', look: 'run-in', pattern: '{cr|lookup:xp}[; PB {cr|lookup:pb}]' };
    expect(blockDisplay(xp, state({}, 'editing'))).toEqual({ state: 'prompt', prompt: 'From CR' });
    expect(blockDisplay(xp, state({}))).toBeNull();
    expect(blockDisplay(block('b5cr0000'), state({}, 'editing'))).toEqual({ state: 'prompt', prompt: 'Add CR' });
  });

  it('hides an empty block, and prompts for it while editing', () => {
    expect(blockDisplay(block('b5speed0'), state({}))).toBeNull();
    expect(blockDisplay(block('b5speed0'), state({}, 'editing'))).toEqual({ state: 'prompt', prompt: 'Add speed' });
  });

  it('shows a container while any block in it shows', () => {
    expect(blockDisplay(block('b5row001'), state({}))).toBeNull();
    expect(blockDisplay(block('b5row001'), state({ ac: 12 }))).toEqual({ state: 'value' });
  });

  it('answers once per state and block', () => {
    const sheet = state({ ac: 12 });
    expect(blockDisplay(block('b5ac0000'), sheet)).toBe(blockDisplay(block('b5ac0000'), sheet));
  });

  it('never shows an unknown block', () => {
    const opaque: TemplateBlock = { id: 'x', type: 'opaque', raw: { type: 'tabs' } };
    expect(blockDisplay(opaque, state({}, 'editing'))).toBeNull();
  });

  it('prompts for a block that is not bound to a field yet, only while editing', () => {
    const unbound: TemplateBlock = { id: 'u', type: 'stat', field: '', look: 'run-in' };
    expect(blockDisplay(unbound, state({}))).toBeNull();
    expect(blockDisplay(unbound, state({}, 'editing'))).toEqual({ state: 'prompt', prompt: 'Value' });
  });
});
