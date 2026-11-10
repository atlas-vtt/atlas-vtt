import { describe, expect, it } from 'vitest';
import {
  clampToList, droppedIndex, fragmentsOf, gapAt, gapLineOf, isNoMove, slidesFor, type ListItemBoxes,
} from '../../../../src/app/statblocks/editor/dnd/listDragGeometry';
import { movedFocusIndex } from '../../../../src/app/statblocks/editor/statblock-pane/entryFocus';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

/** Four abilities, 20 px tall, 4 px apart, in one column 200 px wide from y 100. */
const oneColumn: ListItemBoxes[] = ['a', 'b', 'c', 'd'].map((key, index) => ({ key, rects: [box(0, 100 + index * 24, 200, 120 + index * 24)] }));

/** A list split across two columns: a and b on the left, c split across both, d on the right. */
const twoColumns: ListItemBoxes[] = [
  { key: 'a', rects: [box(0, 100, 200, 120)] },
  { key: 'b', rects: [box(0, 124, 200, 144)] },
  { key: 'c', rects: [box(0, 148, 200, 180), box(220, 0, 420, 16)] },
  { key: 'd', rects: [box(220, 20, 420, 40)] },
];

describe('an ability drag held in its list (spec §7.2)', () => {
  it('finds one fragment per column the list runs through', () => {
    expect(fragmentsOf(oneColumn)).toEqual([box(0, 100, 200, 192)]);
    expect(fragmentsOf(twoColumns)).toEqual([box(0, 100, 200, 180), box(220, 0, 420, 40)]);
  });

  it('clamps the pointer into the nearest fragment, and says how far it pulled', () => {
    const fragments = fragmentsOf(oneColumn);
    expect(clampToList(fragments, { x: 100, y: 400 })).toEqual({ point: { x: 100, y: 192 }, fragment: 0, pulled: 208 });
    expect(clampToList(fragments, { x: -50, y: 150 })?.point).toEqual({ x: 0, y: 150 });
    expect(clampToList(fragmentsOf(twoColumns), { x: 300, y: 30 })?.fragment).toBe(1);
  });

  it('counts the gap in the list\'s order, by the halves of the items', () => {
    const [fragment] = fragmentsOf(oneColumn);
    expect(gapAt(oneColumn, fragment!, 101)).toBe(0);
    expect(gapAt(oneColumn, fragment!, 115)).toBe(1);
    expect(gapAt(oneColumn, fragment!, 191)).toBe(4);
  });

  it('counts across columns: the second column\'s gaps follow the first\'s', () => {
    const right = fragmentsOf(twoColumns)[1]!;
    expect(gapAt(twoColumns, right, 2)).toBe(2);
    expect(gapAt(twoColumns, right, 22)).toBe(3);
    expect(gapAt(twoColumns, right, 39)).toBe(4);
  });

  it('draws the line between the items around the gap, across the list', () => {
    expect(gapLineOf(oneColumn, 1)).toEqual({ orientation: 'horizontal', x: 0, y: 122, length: 200 });
    expect(gapLineOf(oneColumn, 4)?.y).toBe(196);
  });

  it('knows the gaps that move nothing and where the item lands', () => {
    expect(isNoMove(1, 1)).toBe(true);
    expect(isNoMove(1, 2)).toBe(true);
    expect(isNoMove(1, 3)).toBe(false);
    expect(droppedIndex(0, 4)).toBe(3);
    expect(droppedIndex(3, 0)).toBe(0);
  });

  it('slides the items between the two places by the moved item\'s size, in its own column only', () => {
    const plan = slidesFor(oneColumn, 0, 3);
    expect(plan?.shifts.get('b')).toEqual({ x: 0, y: -24 });
    expect(plan?.shifts.get('c')).toEqual({ x: 0, y: -24 });
    expect(plan?.shifts.has('d')).toBe(false);
    expect(slidesFor(twoColumns, 0, 4)).toBeNull();
    expect(slidesFor(oneColumn, 1, 2)).toBeNull();
  });

  it('follows the focused input to where its ability stands after a move', () => {
    expect(movedFocusIndex(2, 2, 0)).toBe(0);
    expect(movedFocusIndex(2, 0, 3)).toBe(1);
    expect(movedFocusIndex(1, 3, 0)).toBe(2);
    expect(movedFocusIndex(3, 0, 1)).toBe(3);
  });
});
