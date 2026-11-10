import { describe, expect, it, vi } from 'vitest';
import { blockMenu, type BlockMenuContext } from '../../../../src/app/statblocks/editor/template-editor/menus/blockMenu';
import { findAction, fitsMenuLimit, type SurfaceAction } from '../../../../src/app/statblocks/editor/interaction/surfaceActions';
import { AUTHORABLE_BLOCK_TYPES, createBlock } from '../../../../src/app/statblocks/model/blockCatalogue';
import { blockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { sampleTemplate, template } from '../template-editor/editorKit';

function context(blocks: TemplateBlock[], blockId: string, extra: Partial<BlockMenuContext> = {}): BlockMenuContext {
  return {
    template: template(blocks), selection: [blockId], blockId, editable: true, canPaste: true,
    run: vi.fn(), openInsert: vi.fn(), openOptions: vi.fn(), copyText: vi.fn(),
    ...extra,
  };
}

const labels = (actions: readonly SurfaceAction[]): string[] => actions.map((action) => (action.kind === 'separator' ? '—' : action.label));

/** A tile's menu in the template editor (spec §5.2, J11). */
describe('blockMenu', () => {
  it('holds at most twelve rows for every block type, editable or not, alone or in a selection, with or without a clip, Delete last', () => {
    for (const type of AUTHORABLE_BLOCK_TYPES) {
      const block = createBlock(type, blockIdSource(new Set()));
      const blocks: TemplateBlock[] = [block, { id: 'other001', type: 'divider' }];
      for (const editable of [true, false]) {
        for (const canPaste of [true, false]) {
          for (const selection of [[block.id], [block.id, 'other001']]) {
            const menu = blockMenu(context(blocks, block.id, { editable, canPaste, selection }));
            expect(fitsMenuLimit(menu), `${type} editable=${editable} paste=${canPaste} n=${selection.length}`).toBe(true);
            expect(menu.at(-1)).toMatchObject({ kind: 'item', destructive: true });
          }
        }
      }
    }
  });

  it('starts with Options and Rename, then where the tile goes, copies and Delete, with keys as hints', () => {
    const { layout } = sampleTemplate();
    const menu = blockMenu(context(layout.blocks, 'stat-hp1'));
    expect(labels(menu)).toEqual([
      'Options…', 'Rename', '—', 'Add above…', 'Add below…', 'Move up', 'Move down', '—',
      'Duplicate', 'Copy', 'Paste below', 'Copy property name', '—', 'Delete',
    ]);
    expect(findAction(menu, 'options')?.hint).toBeTruthy();
    expect(menu.at(-1)).toMatchObject({ label: 'Delete', hint: 'Del', destructive: true });
  });

  it('gives a part of the header Rename, its property\'s name and Hide or Show, and nothing that moves, copies or deletes it', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text' as const }, { key: 'level', label: 'Tier', type: 'rating' as const, meaning: 'rating' as const },
    ];
    const blocks: TemplateBlock[] = [{ id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' }];
    const run = vi.fn();
    const copyText = vi.fn();
    const level = blockMenu(context(blocks, 'header-level', { template: template(blocks, fields), run, copyText }));
    expect(labels(level)).toEqual(['Rename', 'Copy property name', '—', 'Hide from card']);
    expect(findAction(level, 'toggle-hidden')).toMatchObject({ icon: 'eye-off', disabled: false });
    findAction(level, 'toggle-hidden')?.run();
    expect(run).toHaveBeenCalledWith('toggle-hidden');
    findAction(level, 'copy-key')?.run();
    expect(copyText).toHaveBeenCalledWith('level');

    const hidden = { ...template(blocks, fields), header: { hidden: ['level' as const] } };
    expect(findAction(blockMenu(context(blocks, 'header-level', { template: hidden })), 'toggle-hidden')).toMatchObject({ label: 'Show on card', icon: 'eye' });
    expect(labels(blockMenu(context(blocks, 'header-name', { template: template(blocks, fields) })))).toEqual(['Rename', 'Copy property name']);
    expect(labels(blockMenu(context(blocks, 'header-name', { template: template(blocks, fields), editable: false })))).toEqual(['Copy property name']);
  });

  it('leaves out Options where the tile has none', () => {
    const { layout } = sampleTemplate();
    expect(labels(blockMenu(context(layout.blocks, 'divider1', { openOptions: undefined })))).not.toContain('Options…');
  });

  it('keeps Move up and Move down at the ends of a row, disabled, so the menu keeps its shape', () => {
    const { layout } = sampleTemplate();
    const first = blockMenu(context(layout.blocks, 'stat-sp1'));
    expect(findAction(first, 'move-up')?.disabled).toBe(true);
    expect(findAction(first, 'move-down')?.disabled).toBe(false);
    const last = blockMenu(context(layout.blocks, 'stat-cr1'));
    expect(findAction(last, 'move-down')?.disabled).toBe(true);
  });

  it('adds above in a row of its own before the tile\'s row', () => {
    const { layout } = sampleTemplate();
    const openInsert = vi.fn();
    findAction(blockMenu(context(layout.blocks, 'stat-cr1', { openInsert })), 'add-above')?.run();
    expect(openInsert).toHaveBeenCalledWith({ at: { parentId: null, index: 3 } });
  });

  it('deletes through the selection\'s command, and says how many blocks a selection deletes', () => {
    const { layout } = sampleTemplate();
    const run = vi.fn();
    const menu = blockMenu(context(layout.blocks, 'stat-ac1', { run, selection: ['stat-ac1', 'stat-hp1'] }));
    expect(menu.at(-1)).toMatchObject({ label: 'Delete 2 blocks' });
    findAction(menu, 'delete')?.run();
    expect(run).toHaveBeenCalledWith('delete');
  });
});
