import { describe, expect, it } from 'vitest';
import { isStampIcon, MAP_ICON_SVG, stampGlyph, stampIconName } from '../../src/app/pixi/mapIcons';
import { sharedAnnotations } from '../../src/app/online/gm/mapLayerInputs';
import { parseAnnotations } from '../../src/app/online/protocol/index';
import type { DrawingStroke } from '../../src/app/types';
import { PIN_ICON_GROUPS, PIN_ICON_PATHS, PIN_PLACE_GROUPS } from '../../src/app/types/pinIcons';

const OLDER = ['door-open', 'door-closed', 'lock', 'key-round', 'triangle-alert', 'skull', 'flame', 'package', 'gem', 'swords', 'footprints', 'circle-x'];
const NO_FOG = { shape: [], covers: () => false };
const stamp = (id: string, icon: string, more: Partial<DrawingStroke> = {}): DrawingStroke =>
  ({ id, kind: 'drawing', timestamp: 1, type: 'icon', icon, points: [{ x: 100, y: 100 }], color: '#e93147', width: 70, opacity: 1, ...more });

describe('the symbols of stamps', () => {
  it('offers every pin icon once, in groups: the palette\'s marks, then the places', () => {
    const offered = PIN_ICON_GROUPS.flatMap((group) => group.places.map((place) => place.id));
    expect([...offered].sort()).toEqual(Object.keys(PIN_ICON_PATHS).sort());
    expect(new Set(offered).size).toBe(offered.length);
    expect(PIN_ICON_GROUPS[0]!.name).toBe('Marks');
    expect(PIN_ICON_GROUPS[0]!.places.map((place) => place.id)).toEqual(['pin', 'note', 'treasure', 'combat', 'boss', 'lore', 'trap', 'quest', 'important', 'npc', 'secret']);
    expect(PIN_ICON_GROUPS.slice(1)).toEqual(PIN_PLACE_GROUPS);
  });

  it('draws a pin icon as its silhouette and names it as the pin tool does', () => {
    for (const id of Object.keys(PIN_ICON_PATHS)) {
      expect(isStampIcon(id)).toBe(true);
      expect(stampGlyph(id)).toEqual({ kind: 'silhouette', path: PIN_ICON_PATHS[id as keyof typeof PIN_ICON_PATHS] });
      expect(stampIconName(id)).not.toBe('');
    }
    expect(stampIconName('cauldron')).toBe('Cauldron');
  });

  it('keeps the twelve symbols stamps had before as they were drawn, under their ids and names, and offers none of them', () => {
    expect(Object.keys(MAP_ICON_SVG)).toEqual(OLDER);
    for (const id of OLDER) {
      expect(isStampIcon(id)).toBe(false);
      expect(stampGlyph(id)).toEqual({ kind: 'lines', markup: MAP_ICON_SVG[id] });
      // No pin icon may take one of these ids: a stamp made then would change its picture.
      expect(Object.hasOwn(PIN_ICON_PATHS, id)).toBe(false);
    }
    expect(OLDER.map(stampIconName)).toEqual(['Open Door', 'Closed Door', 'Locked', 'Key', 'Trap', 'Danger', 'Fire', 'Loot', 'Treasure', 'Combat', 'Tracks', 'Blocked']);
  });

  it('knows no other symbol, nor one named like something every object has', () => {
    for (const id of ['', 'dragon', 'constructor', 'toString', '__proto__']) {
      expect(stampGlyph(id)).toBeNull();
      expect(stampIconName(id)).toBeNull();
      expect(isStampIcon(id)).toBe(false);
    }
  });
});

describe('stamps and cell fills in the message to the players\' page', () => {
  const cells = (id: string, more: Partial<DrawingStroke> = {}): DrawingStroke => ({
    id, kind: 'drawing', timestamp: 2, type: 'line', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }, { x: 0, y: 0 }],
    color: '#086ddd', width: 0, opacity: 0.4, fill: 'solid', cells: true, ...more,
  });

  it('sends a stamp of a pin icon under its id, as it sends the older ones, with its turn: the message reads both', () => {
    const drawings = { a: stamp('a', 'cauldron', { rotation: 45 }), b: stamp('b', 'skull', { rotation: -90 }) };
    const shared = sharedAnnotations(drawings, {}, NO_FOG);
    expect(shared.drawings).toEqual([
      { type: 'icon', points: [100, 100], colour: '#e93147', width: 70, opacity: 1, icon: 'cauldron', turn: 45 },
      { type: 'icon', points: [100, 100], colour: '#e93147', width: 70, opacity: 1, icon: 'skull', turn: 270 },
    ]);
    expect(parseAnnotations(JSON.parse(JSON.stringify(shared)))).toEqual(shared);
  });

  it('sends a cell fill as a line without a width whose inside is filled, one on the map apart from those above the tokens, and none that is hidden', () => {
    const drawings = { onMap: cells('onMap', { layer: 'map', color: '#e0ac00' }), hidden: cells('hidden', { hidden: true }), above: cells('above') };
    const shared = sharedAnnotations(drawings, {}, NO_FOG);
    const fill = { type: 'pen', points: [0, 0, 70, 0, 70, 70, 0, 70, 0, 0], width: 0, opacity: 0.4, shape: 'line', fill: 'solid' };
    expect(shared.drawings).toEqual([{ ...fill, colour: '#086ddd' }]);
    expect(shared.onMap).toEqual({ drawings: [{ ...fill, colour: '#e0ac00' }], texts: [] });
    // That it was made cell by cell is the GM's tool's to know.
    expect(JSON.stringify(shared)).not.toContain('cells');
    expect(parseAnnotations(JSON.parse(JSON.stringify(shared)))).toEqual(shared);
  });
});
