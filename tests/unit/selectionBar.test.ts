import { describe, expect, it } from 'vitest';
import { drawing, text } from '../../src/app/annotations/__tests__/annotationKit';
import { BAR_GAP, BAR_MARGIN, placeSelectionBar, type BarPlaceInput } from '../../src/app/packages/components/toolbar/selectionBarPlacement';
import { selectionBarTools } from '../../src/app/packages/components/toolbar/selectionBarTools';

const LINE = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const ROOM = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 0, y: 0 }];
const pen = drawing({ id: 'pen', points: LINE });
const line = drawing({ id: 'line', type: 'line', points: LINE });
const room = drawing({ id: 'room', type: 'rectangle', points: ROOM });
const stamp = drawing({ id: 'stamp', type: 'icon', icon: 'skull', points: [{ x: 5, y: 5 }], width: 70 });
const cells = drawing({ id: 'cells', type: 'line', points: ROOM, width: 0, fill: 'solid', cells: true });
const sign = text({ id: 'sign' });

const AFTER = [['front', 'back'], ['players', 'layer', 'lock'], ['delete']];

describe('the tools of the bar under a selection', () => {
  it('offers each kind its own styles after colour and size, then order, who sees it, where it lies, its lock and Delete', () => {
    expect(selectionBarTools([sign])).toEqual([['color', 'size', 'font', 'look'], ...AFTER]);
    expect(selectionBarTools([stamp])).toEqual([['color', 'size', 'icon'], ...AFTER]);
    expect(selectionBarTools([pen])).toEqual([['color', 'size', 'dash', 'ends', 'seeThrough'], ...AFTER]);
    expect(selectionBarTools([line])).toEqual([['color', 'size', 'dash', 'ends', 'curved', 'seeThrough'], ...AFTER]);
    expect(selectionBarTools([room])).toEqual([['color', 'size', 'dash', 'fill', 'seeThrough'], ...AFTER]);
  });

  it('offers what every selected one has, and nothing that changes one of them alone', () => {
    expect(selectionBarTools([sign, stamp])).toEqual([['color', 'size'], ...AFTER]);
    // A cell's fill has no line, so no size and no dash.
    expect(selectionBarTools([cells, room])[0]).toEqual(['color', 'fill', 'seeThrough']);
  });

  it('is nothing for nothing selected', () => {
    expect(selectionBarTools([])).toEqual([]);
  });
});

describe('where the bar under a selection stands', () => {
  const input = (more: Partial<BarPlaceInput> = {}): BarPlaceInput => ({
    shown: [{ x: 400, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 300 }, { x: 400, y: 300 }],
    size: { width: 320, height: 48 },
    area: { width: 1200, height: 800 },
    inset: { top: 40, bottom: 80 },
    current: null,
    ...more,
  });

  it('stands centred under what the frame shows, and grows out of the middle of its top edge', () => {
    const place = placeSelectionBar(input());
    expect(place).toEqual({ x: 340, y: 300 + BAR_GAP, side: 'below', origin: { x: 160, y: 0 } });
  });

  it('stands above where the room below runs out, and grows out of its bottom edge', () => {
    const place = placeSelectionBar(input({ shown: [{ x: 400, y: 600 }, { x: 600, y: 680 }] }));
    expect(place.side).toBe('above');
    expect(place.y).toBe(600 - BAR_GAP - 48);
    expect(place.origin.y).toBe(48);
  });

  it('keeps the side it took while that side holds, so it does not jump at every step near an edge', () => {
    const near = input({ shown: [{ x: 400, y: 300 }, { x: 600, y: 400 }] });
    expect(placeSelectionBar({ ...near, current: 'above' }).side).toBe('above');
    expect(placeSelectionBar({ ...near, current: 'below' }).side).toBe('below');
  });

  it('stays inside the view by the margin, and keeps growing out of the selection where it is pushed aside', () => {
    const left = placeSelectionBar(input({ shown: [{ x: -100, y: 200 }, { x: 20, y: 300 }] }));
    expect(left.x).toBe(BAR_MARGIN);
    expect(left.origin.x).toBe(0);
    const right = placeSelectionBar(input({ shown: [{ x: 1150, y: 200 }, { x: 1300, y: 300 }] }));
    expect(right.x).toBe(1200 - BAR_MARGIN - 320);
    expect(right.origin.x).toBe(320);
  });

  it('stays in the view over a selection as tall as the view', () => {
    const place = placeSelectionBar(input({ shown: [{ x: 400, y: -500 }, { x: 600, y: 1500 }] }));
    expect(place.y).toBeGreaterThanOrEqual(40 + BAR_MARGIN);
    expect(place.y + 48).toBeLessThanOrEqual(800 - 80 - BAR_MARGIN);
  });
});
