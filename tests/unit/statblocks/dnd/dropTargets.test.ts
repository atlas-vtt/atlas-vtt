import { describe, expect, it } from 'vitest';
import type { Box } from '../../../../src/app/statblocks/editor/dnd/dropGeometry';
import {
  dropTargetAt, isNoMove, keyboardTargets, sameTarget, type DragSubject, type DropScene, type DropTarget,
} from '../../../../src/app/statblocks/editor/dnd/dropTargets';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from '../template-editor/editorKit';

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

/**
 * One column 300 wide, as the grid has it: the header Atlas draws at 0–60,
 * which is no block of the layout; a value ac; a row of sp and cr side by
 * side; a section "C" headed Stress holding a table; a divider.
 */
function scene(): DropScene {
  const blocks: TemplateBlock[] = [
    { id: 'ac', type: 'stat', field: 'ac', look: 'run-in' },
    {
      id: 'R', type: 'row', blocks: [
        { id: 'sp', type: 'stat', field: 'speed', look: 'stacked' },
        { id: 'cr', type: 'stat', field: 'cr', look: 'stacked' },
      ],
    },
    { id: 'C', type: 'section', heading: 'Stress', blocks: [{ id: 'sc', type: 'scores', field: 'stress', orientation: 'row' }] },
    { id: 'D', type: 'divider' },
  ];
  const boxes = new Map<string, Box>([
    ['ac', box(0, 70, 300, 90)],
    ['R', box(0, 100, 300, 150)],
    ['sp', box(0, 100, 140, 150)],
    ['cr', box(160, 100, 300, 150)],
    ['C', box(0, 160, 300, 220)],
    ['sc', box(0, 184, 300, 216)],
    ['D', box(0, 230, 300, 232)],
  ]);
  return { layout: template(blocks).layout, boxes, card: box(0, 0, 300, 232) };
}

const moving = (id: string, type: DragSubject['types'][number]): DragSubject => ({ types: [type], movingId: id });
const fresh = (...types: Array<DragSubject['types'][number]>): DragSubject => ({ types, movingId: null });

describe('dropTargetAt in the grid', () => {
  it('puts a tile between two rows, on the line in the middle of their gap', () => {
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 150, y: 95 })).toEqual({
      kind: 'between', parentId: null, index: 1, line: { orientation: 'horizontal', x: 0, y: 95, length: 300 },
    });
  });

  it('never drops into the header: over the name, the line or the token art it goes to the gap before the first row', () => {
    for (const point of [{ x: 100, y: 45 }, { x: 100, y: 10 }, { x: 265, y: 40 }]) {
      expect(dropTargetAt(scene(), moving('D', 'divider'), point), `${point.x},${point.y}`).toMatchObject({ kind: 'between', parentId: null, index: 0 });
    }
  });

  it('drops beside a tile of its own row over the band along its edge, making a row of the two', () => {
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 290, y: 80 })).toEqual({
      kind: 'beside', targetId: 'ac', side: 'end', line: { orientation: 'vertical', x: 304, y: 70, length: 20 },
    });
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 10, y: 80 })).toMatchObject({ kind: 'beside', targetId: 'ac', side: 'start' });
  });

  it('drops between the tiles of a row, on a line of the row\'s height', () => {
    expect(dropTargetAt(scene(), moving('ac', 'stat'), { x: 120, y: 125 })).toEqual({
      kind: 'between', parentId: 'R', index: 1, line: { orientation: 'vertical', x: 150, y: 100, length: 50 },
    });
  });

  it('never drops inside a compound tile: beside it, or above or below its row', () => {
    expect(dropTargetAt(scene(), moving('ac', 'stat'), { x: 150, y: 205 })).toMatchObject({ kind: 'between', parentId: null, index: 3 });
    expect(dropTargetAt(scene(), moving('ac', 'stat'), { x: 150, y: 170 })).toMatchObject({ kind: 'between', parentId: null, index: 2 });
    expect(dropTargetAt(scene(), moving('ac', 'stat'), { x: 290, y: 200 })).toMatchObject({ kind: 'beside', targetId: 'C', side: 'end' });
  });

  it('takes a new kind from the dock like a moved tile', () => {
    expect(dropTargetAt(scene(), fresh('entries'), { x: 150, y: 95 })).toMatchObject({ kind: 'between', parentId: null, index: 1 });
    expect(dropTargetAt(scene(), fresh('stat'), { x: 120, y: 125 })).toMatchObject({ kind: 'between', parentId: 'R', index: 1 });
  });

  it('shows nothing where the drop would leave the tile where it is', () => {
    expect(dropTargetAt(scene(), moving('ac', 'stat'), { x: 150, y: 95 })).toBeNull();
    expect(dropTargetAt(scene(), moving('sp', 'stat'), { x: 70, y: 105 })).toBeNull();
  });

  it('takes an empty template\'s first tile into the card', () => {
    const empty: DropScene = { layout: template([]).layout, boxes: new Map(), card: box(0, 0, 300, 120) };
    expect(dropTargetAt(empty, fresh('stat'), { x: 10, y: 10 })).toEqual({ kind: 'into', parentId: null, outline: box(0, 0, 300, 120) });
    expect(dropTargetAt(empty, fresh('stat'), { x: 10, y: 200 })).toBeNull();
  });

  it('puts the line at the nearer edge where neighbours stand in different columns', () => {
    const blocks: TemplateBlock[] = ['a', 'b', 'c'].map((id) => ({ id, type: 'divider' }));
    const columns: DropScene = {
      layout: template(blocks).layout,
      boxes: new Map([['a', box(0, 0, 100, 40)], ['b', box(0, 50, 100, 90)], ['c', box(120, 0, 220, 40)]]),
      card: box(0, 0, 220, 90),
    };
    expect(dropTargetAt(columns, moving('a', 'divider'), { x: 170, y: 5 })).toMatchObject({ kind: 'between', parentId: null, index: 2, line: { x: 120, y: -4 } });
    expect(dropTargetAt(columns, moving('a', 'divider'), { x: 50, y: 85 })).toMatchObject({ kind: 'between', parentId: null, index: 2, line: { x: 0, y: 94 } });
  });
});

describe('keyboardTargets in the grid', () => {
  const describeTarget = (target: DropTarget): string => (target.kind === 'between'
    ? `${target.parentId ?? 'root'}@${target.index}`
    : target.kind === 'into' ? `into ${target.parentId ?? 'card'}` : target.kind);

  it('lists the gaps between rows and between the tiles of a row, never a section\'s', () => {
    const { targets, start } = keyboardTargets(scene(), moving('D', 'divider'));
    expect(targets.map(describeTarget)).toEqual(['root@0', 'root@1', 'R@0', 'R@1', 'R@2', 'root@2']);
    expect(start).toBe(targets.length);
  });
});

describe('isNoMove and sameTarget', () => {
  it('counts a drop into the moved tile\'s own row as no move', () => {
    const { layout } = scene();
    expect(isNoMove(layout, moving('sp', 'stat'), { kind: 'into', parentId: 'R', outline: box(0, 0, 1, 1) })).toBe(true);
    expect(isNoMove(layout, moving('ac', 'stat'), { kind: 'into', parentId: 'R', outline: box(0, 0, 1, 1) })).toBe(false);
  });

  it('tells targets apart by what they do and where they draw', () => {
    const line = { orientation: 'horizontal' as const, x: 0, y: 10, length: 5 };
    expect(sameTarget({ kind: 'between', parentId: null, index: 1, line }, { kind: 'between', parentId: null, index: 1, line: { ...line } })).toBe(true);
    expect(sameTarget({ kind: 'between', parentId: null, index: 1, line }, { kind: 'between', parentId: null, index: 1, line: { ...line, y: 12 } })).toBe(false);
    expect(sameTarget({ kind: 'refused' }, { kind: 'refused' })).toBe(true);
    expect(sameTarget(null, { kind: 'refused' })).toBe(false);
  });
});

describe('an Abilities tile with tabs', () => {
  /** Tabs "T" (strip 0–20, open tab "A" with a list) after a name; its closed tab "B" draws nothing. */
  function tabsScene(): DropScene {
    const blocks: TemplateBlock[] = [
      { id: 'name', type: 'title', field: 'name', level: 1 },
      {
        id: 'T', type: 'tabs', blocks: [
          { id: 'A', type: 'section', heading: 'Cantrips', blocks: [{ id: 'la', type: 'entries', field: 'cantrips' }] },
          { id: 'B', type: 'section', heading: 'Level 1', blocks: [{ id: 'lb', type: 'entries', field: 'level_1' }] },
        ],
      },
      { id: 'D', type: 'divider' },
    ];
    const boxes = new Map<string, Box>([
      ['name', box(0, 0, 300, 20)],
      ['T', box(0, 30, 300, 90)],
      ['A', box(0, 58, 300, 90)],
      ['la', box(0, 60, 300, 88)],
      ['D', box(0, 100, 300, 102)],
    ]);
    return { layout: template(blocks).layout, boxes, card: box(0, 0, 300, 102) };
  }

  it('takes drops above or below it, never into a tab', () => {
    expect(dropTargetAt(tabsScene(), fresh('stat'), { x: 150, y: 35 })).toMatchObject({ kind: 'between', parentId: null, index: 1 });
    expect(dropTargetAt(tabsScene(), moving('D', 'divider'), { x: 150, y: 70 })).toBeNull();
    const { targets } = keyboardTargets(tabsScene(), moving('D', 'divider'));
    expect(targets.some((target) => target.kind !== 'refused' && (target.parentId === 'A' || target.parentId === 'B' || target.parentId === 'T'))).toBe(false);
  });
});
