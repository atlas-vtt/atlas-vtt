import { describe, expect, it } from 'vitest';
import {
  gridAcceptsBeside, gridAcceptsList, gridInsertTarget, kindName, selectableBlocks, selectableFor, templateGrid, tidyRows, tileKind,
} from '../../../../src/app/statblocks/model/templateGrid';
import { setHeaderPartHidden } from '../../../../src/app/statblocks/model/templateHeader';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';
import type { TemplateBlock, TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';
import { shape, template } from '../template-editor/editorKit';

const AC: TemplateBlock = { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' };
const HP: TemplateBlock = { id: 'stat-hp1', type: 'stat', field: 'hp', look: 'run-in' };
const STATS: TemplateBlock = { id: 'statsrow', type: 'row', blocks: [AC, HP] };
const ACTIONS: TemplateBlock = { id: 'actions1', type: 'entries', field: 'actions' };
const STRESS: TemplateBlock = { id: 'stress01', type: 'section', heading: 'Stress', blocks: [{ id: 'scores01', type: 'scores', field: 'stress', orientation: 'row' }] };

const layout = (...blocks: TemplateBlock[]): TemplateLayout => ({ maxColumns: 1, blocks });

describe('the grid of a template', () => {
  it('names a block by its kind in the grid, and what the grid has no kind for by its block', () => {
    expect([AC, ACTIONS, STRESS, STATS].map(kindName)).toEqual(['Value', 'Abilities', 'Section', 'Side by side']);
    const tabs: TemplateBlock = { id: 'tabs0001', type: 'tabs', blocks: [{ id: 'tab00001', type: 'section', heading: 'Actions', blocks: [ACTIONS] }] };
    expect(kindName(tabs)).toBe('Abilities');
    expect(kindName({ ...tabs, blocks: [STRESS] })).toBe('Tabs');
  });

  it('reads rows of tiles side by side, and single tiles as rows of their own', () => {
    const grid = templateGrid(layout(STATS, ACTIONS, STRESS));
    expect(grid.rows).toEqual([
      { id: 'statsrow', paired: true, tiles: [{ id: 'stat-ac1', kind: 'value' }, { id: 'stat-hp1', kind: 'value' }] },
      { id: 'actions1', paired: false, tiles: [{ id: 'actions1', kind: 'abilities' }] },
      { id: 'stress01', paired: false, tiles: [{ id: 'stress01', kind: 'other' }] },
    ]);
  });

  it('selects the header\'s shown parts first, then the tiles; never a row, a hidden part or the inside of a compound tile', () => {
    const whole = template([STATS, ACTIONS, STRESS]);
    expect(selectableBlocks(whole)).toEqual([
      'header-name', 'header-token', 'header-level', 'header-type', 'header-hp', 'header-description', 'stat-ac1', 'stat-hp1', 'actions1', 'stress01',
    ]);
    const hidden = setHeaderPartHidden(whole, 'level', true);
    expect(selectableBlocks(hidden)).not.toContain('header-level');
    expect(selectableFor(hidden, 'header-level')).toBeNull();
    expect(selectableFor(whole, 'header-type')).toBe('header-type');
    expect(selectableFor(whole, 'scores01')).toBe('stress01');
    expect(selectableFor(whole, 'statsrow')).toBeNull();
  });

  it('puts a tile added from a part of the header at the top of the rows', () => {
    const { layout: scene } = template([STATS, ACTIONS]);
    expect(gridInsertTarget(scene, 'header-hp')).toEqual({ parentId: null, index: 0 });
    expect(gridInsertTarget(scene, 'stat-hp1')).toEqual({ parentId: null, index: 1 });
    expect(gridInsertTarget(scene, null)).toEqual({ parentId: null, index: 2 });
  });

  it('reads an abilities list split into tabs as one Abilities tile', () => {
    const tabs: TemplateBlock = { id: 'tabs0001', type: 'tabs', blocks: [
      { id: 'tabone01', type: 'section', heading: 'Cantrips', blocks: [{ ...ACTIONS, id: 'list0001' }] },
      { id: 'tabtwo01', type: 'section', heading: '1st level', blocks: [{ ...ACTIONS, id: 'list0002' }] },
    ] };
    expect(tileKind(tabs)).toBe('abilities');
    expect(tileKind({ ...tabs, blocks: [{ id: 'tabone01', type: 'section', blocks: [AC, HP] }] })).toBe('other');
    expect(tileKind({ id: 'scores01', type: 'scores', field: 'stats', orientation: 'row' })).toBe('table');
    expect(tileKind({ id: 'tags0001', type: 'tags', field: 'languages', look: 'comma' })).toBe('value');
  });

  it('lets drops land between rows and tiles of a row, never in a section or beside a part of the header', () => {
    const scene = layout(STATS, ACTIONS, STRESS);
    expect(gridAcceptsList(scene, null)).toBe(true);
    expect(gridAcceptsList(scene, 'statsrow')).toBe(true);
    expect(gridAcceptsList(scene, 'stress01')).toBe(false);
    expect(gridAcceptsList(scene, 'header-name')).toBe(false);
    expect(gridAcceptsBeside(scene, 'actions1')).toBe(true);
    expect(gridAcceptsBeside(scene, 'stat-hp1')).toBe(true);
    expect(gridAcceptsBeside(scene, 'header-name')).toBe(false);
    expect(gridAcceptsBeside(scene, 'scores01')).toBe(false);
  });

  it('tidies a row left with one tile into the tile and drops an empty one', () => {
    const lone: TemplateBlock = { id: 'lonerow1', type: 'row', blocks: [AC] };
    const empty: TemplateBlock = { id: 'emptyrow', type: 'row', blocks: [] };
    expect(shape(tidyRows(layout(lone, empty, ACTIONS)).blocks)).toBe('stat-ac1 actions1');
    const tidy = layout(STATS, ACTIONS);
    expect(tidyRows(tidy)).toBe(tidy);
  });

  it('reads every built-in template as rows', () => {
    for (const { id, template: builtIn } of BUILT_IN_TEMPLATES) expect(templateGrid(builtIn.layout).rows.length, id).toBeGreaterThan(0);
  });
});
