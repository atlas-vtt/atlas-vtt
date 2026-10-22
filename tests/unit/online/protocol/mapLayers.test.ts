import { describe, expect, it } from 'vitest';
import { MAX_DRAWING_POINTS, parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';

const HASH = 'b'.repeat(64);
const GRID = { type: 'hex-vertical', size: 70, offsetX: 3, offsetY: -2, colour: '#112233', alpha: 0.5, lineWidth: 2, lineType: 'dashed', numbers: { format: 'letter-number', opacity: 0.8 } };
const TEXT = { x: 1, y: 2, text: 'Tavern', fontSize: 24, fontFamily: 'Georgia, "Times New Roman", serif', colour: '#ffffff', background: null, padding: 8, radius: 0, opacity: 1, align: 'center', bold: false, italic: true, rotation: 45, scale: 1 };
const COMBATANT = { initiative: 18, name: 'Ogre', turn: true, sitsOut: false, art: { hash: HASH, size: 10, mime: 'image/webp' }, ring: { colour: null }, side: 'opponents', hp: { current: 3, max: 10 } };
const INITIATIVE = { isActive: true, round: 2, bySides: false, firstSide: 'players', activeSide: null, combatants: [COMBATANT] };

const valid: GmMessage[] = [
  { t: 'grid', scene: 's', grid: GRID },
  { t: 'grid', scene: 's', grid: null },
  { t: 'doors', scene: 's', doors: [{ p: [0, 0, 70, 0], open: true }] },
  { t: 'sensed', scene: 's', tokens: [{ x: 10, y: 20, size: 70 }] },
  { t: 'annotations', scene: 's', drawings: [{ type: 'pen', points: [0, 0, 5, 5], colour: '#ff0000', width: 4, opacity: 1 }, { type: 'icon', points: [3, 3], colour: '#00ff00', width: 40, opacity: 0.5, icon: 'skull' }], texts: [TEXT] },
  { t: 'initiative', scene: 's', list: INITIATIVE },
  { t: 'initiative', scene: 's', list: null },
] as GmMessage[];

describe("messages of the map's layers", () => {
  it('read as they were written', () => {
    for (const message of valid) expect(parseGmMessage(JSON.parse(JSON.stringify(message))), message.t).toEqual(message);
  });

  it('refuse what does not fit', () => {
    const bad: unknown[] = [
      { t: 'grid', scene: 's', grid: { ...GRID, colour: 'red' } },
      { t: 'grid', scene: 's', grid: { ...GRID, numbers: { format: 'roman', opacity: 1 } } },
      { t: 'grid', scene: 's', grid: { ...GRID, size: 0 } },
      { t: 'doors', scene: 's', doors: [{ p: [0, 0, 1], open: true }] },
      { t: 'doors', scene: 's', doors: [{ p: [0, 0, 1, 1], open: true, locked: 'x', secret: 1 }].map(({ p, open }) => ({ p, open: open ? 'yes' : 'no' })) },
      { t: 'sensed', scene: 's', tokens: [{ x: Number.NaN, y: 0, size: 1 }] },
      { t: 'annotations', scene: 's', drawings: [{ type: 'pen', points: [0], colour: '#ffffff', width: 1, opacity: 1 }], texts: [] },
      { t: 'annotations', scene: 's', drawings: [{ type: 'icon', points: [0, 0], colour: '#ffffff', width: 1, opacity: 1, icon: '<svg>' }], texts: [] },
      { t: 'annotations', scene: 's', drawings: [{ type: 'pen', points: Array.from({ length: MAX_DRAWING_POINTS * 2 + 2 }, () => 1), colour: '#ffffff', width: 1, opacity: 1 }], texts: [] },
      { t: 'annotations', scene: 's', drawings: [], texts: [{ ...TEXT, fontFamily: 'x; } body { display: none' }] },
      { t: 'annotations', scene: 's', drawings: [], texts: [{ ...TEXT, text: 'x'.repeat(2001) }] },
      { t: 'initiative', scene: 's', list: { ...INITIATIVE, combatants: [{ ...COMBATANT, side: 'gm' }] } },
      { t: 'initiative', scene: 's', list: { ...INITIATIVE, combatants: [{ ...COMBATANT, ring: { colour: 'url(x)' } }] } },
      { t: 'initiative', scene: 's', list: { ...INITIATIVE, round: Number.POSITIVE_INFINITY } },
    ];
    for (const message of bad) expect(parseGmMessage(JSON.parse(JSON.stringify(message))), JSON.stringify(message).slice(0, 120)).toBeNull();
  });
});
