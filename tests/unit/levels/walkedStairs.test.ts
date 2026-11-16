import { describe, expect, it } from 'vitest';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { copiedLevelLink, placedLevelLink } from '../../../src/app/levels/levelLinkCopies';
import { flightOnLevel, flightSides, levelLinkList, levelLinksFromFile, linkLandings } from '../../../src/app/levels/levelLinks';
import { flightRows } from '../../../src/app/levels/stairFlights';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore, runHistoryTransaction } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import type { LevelLink, LevelLinkFlight, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: null },
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

/** Cells of 100 px. Two wide and three long, the foot at the bottom (edge 2): walked up northwards. */
const WIDE = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }];
const UP_NORTH: LevelLinkFlight = { foot: 2, rows: 3 };
/** One wide and two long, the foot on the left (edge 3): walked up eastwards. */
const NARROW = [{ x: 1000, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 100 }, { x: 1000, y: 100 }];

const stairs = (id: string, polygon = WIDE, flight: LevelLinkFlight | null = UP_NORTH, levels: LevelLink['levels'] = ['ground', 'upper'], direction?: LevelLink['direction']): LevelLink =>
  ({ id, kind: 'level-link', polygon, levels, ...(flight && { flight }), ...(direction && { direction }) });
const token = (id: string, level = 'ground', x = 500, y = 500): TokenEntity => ({ id, kind: 'token', x, y, imagePath: `${id}.png`, level });

function sceneStore(links: Record<string, LevelLink>, tokens: Record<string, TokenEntity>): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `walked-stairs-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'ground',
    objects: { ...store.getState().objects, tokens, levelLinks: links },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

/** The GM's drop of one token at a place, as the token renderer drops: one undo step. */
function drop(store: ViewAtlasStore, id: string, x: number, y: number): string | undefined {
  runHistoryTransaction(store, () => store.getState().dropTokens([{ id, x, y }]));
  return store.getState().objects.tokens[id]!.level;
}

describe('walked stairs', () => {
  it('change a token\'s level only in the last row at the far end, across their whole width', () => {
    const store = sceneStore({ stairs: stairs('stairs') }, { knight: token('knight') });
    expect(drop(store, 'knight', 50, 250)).toBe('ground');
    expect(drop(store, 'knight', 150, 150)).toBe('ground');
    expect(drop(store, 'knight', 150, 50)).toBe('upper');
    expect(store.getState().objects.tokens.knight).toMatchObject({ x: 150, y: 50 });

    const other = sceneStore({ stairs: stairs('stairs') }, { knight: token('knight') });
    expect(drop(other, 'knight', 50, 50)).toBe('upper');
  });

  it('take a one-wide flight on its last cell only', () => {
    const store = sceneStore({ narrow: stairs('narrow', NARROW, { foot: 3, rows: 2 }) }, { knight: token('knight') });
    expect(drop(store, 'knight', 1050, 50)).toBe('ground');
    expect(drop(store, 'knight', 1150, 50)).toBe('upper');
  });

  it('leave an arriving token on the other level\'s ground end, so putting it down there again keeps it; back down is the same walk', () => {
    const store = sceneStore({ stairs: stairs('stairs') }, { knight: token('knight') });
    expect(drop(store, 'knight', 150, 50)).toBe('upper');
    // The same place upstairs is where the stairs are stepped on from there.
    expect(drop(store, 'knight', 150, 50)).toBe('upper');
    expect(drop(store, 'knight', 150, 150)).toBe('upper');
    expect(drop(store, 'knight', 150, 250)).toBe('ground');
    expect(drop(store, 'knight', 150, 250)).toBe('ground');
  });

  it('each change of level is the drop\'s one undo step', () => {
    const store = sceneStore({ stairs: stairs('stairs') }, { knight: token('knight', 'ground', 50, 150) });
    drop(store, 'knight', 50, 50);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.tokens.knight).toMatchObject({ x: 50, y: 150, level: 'ground' });
  });

  it('let the GM put a token anywhere, across their sides too: nothing but the far row changes its level', () => {
    const store = sceneStore({ stairs: stairs('stairs') }, { knight: token('knight', 'ground', 400, 150) });
    expect(drop(store, 'knight', 100, 150)).toBe('ground');
    expect(store.getState().objects.tokens.knight).toMatchObject({ x: 100, y: 150 });
  });

  it('keep a one-way flight\'s way: up only leaves a token upstairs in the foot row', () => {
    const store = sceneStore({ stairs: stairs('stairs', WIDE, UP_NORTH, ['ground', 'upper'], 'up') }, { knight: token('knight', 'upper') });
    expect(drop(store, 'knight', 50, 250)).toBe('upper');
  });

  it('are plain stairs where they cannot be walked: no flight, more than two levels, or not four corners', () => {
    const tri = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 300 }];
    for (const link of [stairs('old', WIDE, null), stairs('lift', WIDE, UP_NORTH, 'all'), stairs('tri', tri, UP_NORTH)]) {
      // Inside, short of the far row: an elevator offers its floors there, stairs take the token.
      const scene = { levels: LEVELS, objects: { tokens: { knight: token('knight') }, levelLinks: { [link.id]: link } } };
      expect(linkLandings(scene, [{ id: 'knight', x: 50, y: 100 }]), link.id).toHaveLength(1);
      expect(flightOnLevel(levelLinkList({ [link.id]: link })[0]!, 'ground', LEVELS), link.id).toBeNull();
    }
  });

  it('name the sides a walking token may not cross: all but the end at its level\'s ground', () => {
    const links = levelLinkList({ stairs: stairs('stairs') });
    const key = ([a, b]: [{ x: number; y: number }, { x: number; y: number }]): string => `${a.x},${a.y}-${b.x},${b.y}`;
    // Downstairs the foot (y 300) is open; upstairs the head (y 0).
    expect(flightSides(links, 'ground', LEVELS).map(key).sort()).toEqual(['0,0-200,0', '0,300-0,0', '200,0-200,300'].sort());
    expect(flightSides(links, 'upper', LEVELS).map(key).sort()).toEqual(['0,300-0,0', '200,0-200,300', '200,300-0,300'].sort());
    expect(flightSides(links, 'cellar', LEVELS)).toEqual([]);
    expect(flightSides(levelLinkList({ old: stairs('old', WIDE, null) }), 'ground', LEVELS)).toEqual([]);
  });

  it('read a flight only as the file can mean it, and keep the file\'s record as it came', () => {
    const record = levelLinksFromFile({
      good: stairs('good'),
      footOut: { ...stairs('footOut'), flight: { foot: 4, rows: 2 } },
      oneRow: { ...stairs('oneRow'), flight: { foot: 0, rows: 1 } },
      halfRow: { ...stairs('halfRow'), flight: { foot: 0, rows: 2.5 } },
      text: { ...stairs('text'), flight: 'north' },
    })!;
    const read = Object.fromEntries(levelLinkList(record).map((link) => [link.id, link.flight]));
    expect(read).toEqual({ good: UP_NORTH, footOut: undefined, oneRow: undefined, halfRow: undefined, text: undefined });
    expect(record.text!.flight).toBe('north');
  });

  it('keep their flight when copied, pasted and moved with the map', () => {
    const copy = copiedLevelLink(stairs('stairs'), 'ground', LEVELS)!;
    expect(placedLevelLink(copy, 'cellar', LEVELS)).toMatchObject({ levels: ['cellar', 'ground'], flight: UP_NORTH });
    const moved = objectsMovedWithMap({ tokens: {}, levelLinks: { stairs: stairs('stairs') } } as never, (point) => ({ x: point.x * 2, y: point.y }));
    expect((moved as { levelLinks: Record<string, LevelLink> }).levelLinks.stairs!.flight).toEqual(UP_NORTH);
  });

  it('count their rows from the foot\'s middle to the head\'s, at least two', () => {
    expect(flightRows(WIDE, 2, 100)).toBe(3);
    expect(flightRows(WIDE, 1, 100)).toBe(2);
    expect(flightRows(NARROW, 3, 100)).toBe(2);
    expect(flightRows(WIDE, 2, 0)).toBe(2);
  });

  it('report a landing only where a drop changes level', () => {
    const scene = { levels: LEVELS, objects: { tokens: { knight: token('knight') }, levelLinks: { stairs: stairs('stairs') } } };
    expect(linkLandings(scene, [{ id: 'knight', x: 50, y: 150 }])).toEqual([]);
    expect(linkLandings(scene, [{ id: 'knight', x: 50, y: 50 }])).toEqual([{ tokenId: 'knight', targets: ['upper'] }]);
  });
});
