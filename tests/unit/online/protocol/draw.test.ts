import { describe, expect, it } from 'vitest';
import {
  drawnText, MAX_DRAW_IDS, MAX_DRAW_NUMBERS, MAX_PLAYER_TEXT_LENGTH, parseGmMessage, parsePlayerMessage,
  type DrawLook, type DrawTextLook, type PlayerDrawMessage,
} from '../../../../src/app/online/protocol/index.ts';

const LOOK: DrawLook = { colour: '#e93147', size: 'm' };
const TEXT_LOOK: DrawTextLook = { colour: '#086ddd', size: 'l', font: 'mono', look: 'plate', align: 'center' };
const read = (message: unknown): unknown => parsePlayerMessage(JSON.parse(JSON.stringify(message)));

describe('a player\'s Draw tool on the wire', () => {
  it('reads every request back as it was sent', () => {
    const messages: PlayerDrawMessage[] = [
      { t: 'stroke', scene: 's', n: 3, mode: 'pen', pts: [1, 2, 3, 4], from: 7, span: 100, look: { ...LOOK, seeThrough: true } },
      { t: 'stroke', scene: 's', n: 3, mode: null, pts: [] },
      { t: 'draw-points', scene: 's', n: 4, from: 0, pts: [1, 2, 3, 4] },
      { t: 'draw-add', scene: 's', n: 4, mode: 'line', pts: [0, 0, 5, 5, 9, 0], closed: true, look: { ...LOOK, dash: 'dotted', fill: 'solid', curved: true } },
      { t: 'draw-add', scene: 's', n: 5, mode: 'pen', pts: [0, 0], from: 480, look: LOOK },
      { t: 'draw-add', scene: 's', n: 6, mode: 'ellipse', pts: [0, 0, 5, 5], look: { ...LOOK, ends: 'both' } },
      { t: 'draw-text', scene: 's', n: 7, x: 10, y: 20, text: 'Two\nlines', wrap: 80, breaks: [2], look: { ...TEXT_LOOK, bold: true, italic: true } },
      { t: 'draw-change', scene: 's', n: 8, ids: ['1', '2a'], map: [1, 0, 0, 1, 10, -10, 0] },
      { t: 'draw-change', scene: 's', n: 9, ids: ['1'], style: { fill: null } },
      { t: 'draw-change', scene: 's', n: 10, ids: ['1'], line: { pts: [0, 0, 5, 5], anchors: [0, 0, 5, 5], from: 2 } },
      { t: 'draw-change', scene: 's', n: 11, ids: ['1'], words: { x: 1, y: 2, text: 'New words', wrap: 60, breaks: [4] } },
      { t: 'draw-remove', scene: 's', n: 12, ids: ['1', 'z9'] },
      { t: 'draw-erase', scene: 's', n: 13, pts: [5, 5, 9, 9], size: 'xl', whole: true },
    ];
    for (const message of messages) expect(read(message)).toEqual(message);
  });

  it('refuses a request without its scene or its number, and anything it has no word for', () => {
    const add = { t: 'draw-add', scene: 's', n: 1, mode: 'pen', pts: [1, 2], look: LOOK };
    expect(read(add)).not.toBeNull();
    for (const change of [{ scene: '' }, { scene: undefined }, { n: -1 }, { n: 1.5 }, { n: undefined }, { mode: 'stamp' }, { mode: 'cells' }, { pts: [1] }, { pts: [1, Number.NaN] }, { pts: [] }, { pts: [1, 2_000_000] },
      { pts: Array.from({ length: MAX_DRAW_NUMBERS + 2 }, () => 1) }, { closed: true }, { look: undefined }, { look: { ...LOOK, colour: 'red' } }, { look: { ...LOOK, size: 'xxl' } }, { look: { ...LOOK, dash: 'wavy' } }]) {
      expect(read({ ...add, ...change })).toBeNull();
    }
    // A width, an opacity, a layer or who sees it are no part of a look: what a page adds is not read.
    expect(read({ ...add, look: { ...LOOK, width: 9999, opacity: 0.1, hidden: true, layer: 'map' } })).toEqual(add);
    expect(read({ ...add, hidden: true, layer: 'map', locked: true, group: 'g', by: 'x', order: 99 })).toEqual(add);
    // A rectangle and an ellipse are the two corners of their box.
    expect(read({ ...add, mode: 'rectangle', pts: [1, 2, 3, 4, 5, 6] })).toBeNull();
  });

  it('takes one change at a time, and one drawing or text where it is set anew', () => {
    const base = { t: 'draw-change', scene: 's', n: 1, ids: ['1'] };
    expect(read(base)).toBeNull();
    expect(read({ ...base, map: [1, 0, 0, 1, 0, 0, 0], style: { bold: true } })).toBeNull();
    expect(read({ ...base, ids: ['1', '2'], line: { pts: [0, 0, 1, 1] } })).toBeNull();
    expect(read({ ...base, ids: ['1', '2'], words: { x: 0, y: 0 } })).toBeNull();
    expect(read({ ...base, map: [1, 0, 0, 1, 0, 0] })).toBeNull();
    expect(read({ ...base, map: [5000, 0, 0, 1, 0, 0, 0] })).toBeNull();
    expect(read({ ...base, map: [1, 0, 0, 1, Number.POSITIVE_INFINITY, 0, 0] })).toBeNull();
    for (const ids of [[], ['1', '1'], ['A'], ['drawing_1700000000000_abcdefghi'], Array.from({ length: MAX_DRAW_IDS + 1 }, (_, index) => index.toString(36))]) {
      expect(read({ ...base, ids, style: { bold: true } })).toBeNull();
    }
  });

  it('cleans a text as a page must before it measures it, and takes only cleaned words', () => {
    expect(drawnText('  The‮ mill\r\nby the\triver  \n\n')).toBe('  The  mill\nby the river');
    expect(drawnText('​ \n')).toBeNull();
    expect(drawnText('x'.repeat(MAX_PLAYER_TEXT_LENGTH + 1))).toBeNull();
    expect(drawnText(7)).toBeNull();
    const text = { t: 'draw-text', scene: 's', n: 1, x: 1, y: 1, text: 'Mill', look: TEXT_LOOK };
    expect(read(text)).toEqual(text);
    expect(read({ ...text, breaks: [2] })).toBeNull();
    expect(read({ ...text, wrap: 50, breaks: [2, 2] })).toBeNull();
    expect(read({ ...text, wrap: 50, breaks: [9] })).toBeNull();
    expect(read({ ...text, wrap: 0 })).toBeNull();
    expect(read({ ...text, look: { ...TEXT_LOOK, font: 'Comic Sans' } })).toBeNull();
  });

  it('tells a player what is theirs and why a request was not taken, and reads a reason it does not know as the plainest', () => {
    const mine = { t: 'draw-mine', scene: 's', rev: 4, drawings: [{ at: 0, id: '1' }, { at: 3, id: 'a' }], texts: [{ at: 1, id: '2' }], seen: 17 };
    expect(parseGmMessage(mine)).toEqual(mine);
    // An entry that cannot be read is passed over, and so is an id or a place named twice.
    expect(parseGmMessage({ ...mine, drawings: [{ at: 0, id: '1' }, { at: 0, id: '2' }, { at: 2, id: '1' }, { at: -1, id: '3' }, { at: 5, id: 'drawing_1' }, 'x'] })).toMatchObject({ drawings: [{ at: 0, id: '1' }] });
    expect(parseGmMessage({ ...mine, seen: -1 })).toBeNull();
    expect(parseGmMessage({ ...mine, rev: undefined })).toBeNull();
    expect(parseGmMessage({ t: 'draw-refused', scene: 's', n: 3, reason: 'full' })).toEqual({ t: 'draw-refused', scene: 's', n: 3, reason: 'full' });
    expect(parseGmMessage({ t: 'draw-refused', scene: 's', n: 3, reason: 'a-later-reason' })).toMatchObject({ reason: 'shape' });
  });

  it('numbers the drawings a player\'s own are counted in, and says while players may draw', () => {
    const annotations = { t: 'annotations', scene: 's', rev: 7, drawings: [], texts: [] };
    expect(parseGmMessage(annotations)).toEqual(annotations);
    expect(parseGmMessage({ ...annotations, rev: 'x' })).toEqual({ t: 'annotations', scene: 's', drawings: [], texts: [] });
    const rules = {
      t: 'rules', scene: 's', grid: { type: 'square', size: 70, offsetX: 0, offsetY: 0 }, snap: true, accent: null,
      measurement: { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 53 },
    };
    expect(parseGmMessage({ ...rules, draw: { cell: 70 } })).toMatchObject({ draw: { cell: 70 } });
    // A word about drawing that cannot be read leaves the rules without it: players then do not draw.
    for (const draw of [true, { cell: 0 }, { cell: 'big' }, null]) expect(parseGmMessage({ ...rules, draw })).not.toHaveProperty('draw');
  });
});
