// @vitest-environment jsdom
import { Container, Text } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { handleDrag, sameDragChanges } from '../../../src/app/pixi/measure/measureHandleDrag';
import type { MeasurePlayersView } from '../../../src/app/pixi/measurePartsVisibility';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import { GRID, measureScene, type MeasureScene } from '../../helpers/measureScene';

let current: MeasureScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, rangeBands: [], coneAngle: 90, diagonalRule: 'equidistant' };
const cell = (col: number, row: number): { x: number; y: number } => ({ x: col * GRID + GRID / 2, y: row * GRID + GRID / 2 });
const token = (id: string, col: number, row: number, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, imagePath: '', ...cell(col, row), ...more });
const RIM = GRID / 2;
/** Where an aura's badge stands from its token's centre: on the rim of its space, lower left. */
const badgeOf = (at: { x: number; y: number }, rim = RIM): { x: number; y: number } => ({ x: at.x - Math.SQRT1_2 * rim, y: at.y + Math.SQRT1_2 * rim });

interface Scene {
  s: MeasureScene;
  /** The hero's aura of 10 ft: two cells past its space. */
  id: string;
  aura: () => KeptMeasure | undefined;
  press: (x: number, y: number) => boolean;
  move: (x: number, y: number, alt?: boolean) => void;
  up: () => void;
  steps: () => number;
}

/** A map of 70 px cells that counts 5 ft a cell: the hero on cell (4, 4) with an aura of 10 ft, a goblin two cells to its right and an orc far off. */
function scene(more: Partial<TokenEntity> = {}): Scene {
  const s = measureScene();
  current = s;
  const { store } = s;
  s.measure.measurementSettingsProvider = () => FEET;
  const tokens = [token('hero', 4, 4, more), token('goblin', 6, 4), token('orc', 12, 4)];
  store.setState({ objects: { ...store.getState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });
  store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: [cell(4, 4), { x: cell(4, 4).x + RIM + 2 * GRID, y: cell(4, 4).y }] }]);
  const id = Object.keys(store.getState().objects.measures ?? {})[0]!;
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    s, id,
    aura: () => store.getState().objects.measures?.[id],
    press: (x, y) => s.measure.handles.pointer.pointerDown(x, y, { global: { x, y } } as never),
    move: (x, y, alt = false) => s.pointer('pointermove', x, y, { alt }),
    up: () => s.pointer('pointerup', 0, 0),
    steps: () => history.getState().pastStates.length,
  };
}

const place = (view: Container | undefined): { x: number; y: number } | null => (view ? { x: view.position.x, y: view.position.y } : null);
const badge = (s: MeasureScene): { x: number; y: number } | null => place(s.measure.handles.layer.getChildByLabel('measure-origin-handles')?.children[0]);
const end = (s: MeasureScene): { x: number; y: number } | null => place(s.measure.handles.layer.getChildByLabel('measure-end-handles')?.children[0]);
/** The texts of the kept measurements' labels that show. */
function labels(s: MeasureScene): string[] {
  const found: string[] = [];
  const walk = (node: Container): void => {
    if (!node.visible) return;
    // The live measurement's label stands empty while nothing is measured.
    if (node instanceof Text && node.text !== '') found.push(node.text);
    node.children.forEach(walk);
  };
  walk(s.viewport.getChildByLabel('measure-labels')!);
  return found;
}
/** The bodies of the kept areas that show; the first body is the live measurement's. */
const bodies = (s: MeasureScene): Container[] => s.viewport.getChildByLabel('measure-bodies')?.children.slice(1).filter((body) => body.visible) ?? [];

describe('an aura on the map', () => {
  it('lies around its token: labelled with its reach, its badge on the token\'s rim and its far handle on its outline', () => {
    const { s, id } = scene();
    expect(labels(s)).toEqual(['10ft']);
    expect(badge(s)).toEqual(badgeOf(cell(4, 4)));
    // Two cells past the token's own cell, to its right.
    expect(end(s)).toEqual({ x: 7 * GRID, y: cell(4, 4).y });
    // The goblin stands in it; its own token is never counted, nor the orc far off.
    expect(s.measure.tokensIn(id)).toEqual(['goblin']);
  });

  it('follows its token with every move, without a write of its own, and counts the tokens where it lies then', () => {
    const { s, id, steps } = scene();
    const kept = s.store.getState().objects.measures;
    s.store.getState().setTokenPositions([{ id: 'hero', ...cell(10, 4) }]);
    expect(s.store.getState().objects.measures).toBe(kept);
    expect(badge(s)).toEqual(badgeOf(cell(10, 4)));
    expect(end(s)).toEqual({ x: 13 * GRID, y: cell(4, 4).y });
    expect(s.measure.tokensIn(id)).toEqual(['orc']);
    // Dragged a little within its cell, the badge follows the token and the outline stays on its cells.
    s.store.getState().setTokenPositions([{ id: 'hero', x: cell(10, 4).x + 20, y: cell(10, 4).y }]);
    expect(badge(s)).toEqual(badgeOf({ x: cell(10, 4).x + 20, y: cell(10, 4).y }));
    expect(end(s)).toEqual({ x: 13 * GRID, y: cell(4, 4).y });
    expect(steps()).toBe(2);
  });

  it('grows with its token: it reaches as far from the edge of a larger space', () => {
    const { s } = scene();
    s.store.getState().updateTokens([{ id: 'hero', changes: { size: 2 } }]);
    // Three cells a side now, and two more to the right.
    expect(end(s)).toEqual({ x: 8 * GRID, y: cell(4, 4).y });
    expect(badge(s)).toEqual(badgeOf(cell(4, 4), 1.5 * GRID));
  });

  it('is drawn with its token or not at all: gone while the token is beside the map, back when it returns', () => {
    const { s, aura } = scene();
    expect(bodies(s)).toHaveLength(1);
    s.store.getState().updateTokens([{ id: 'hero', changes: { offMap: true } }]);
    expect(bodies(s)).toHaveLength(0);
    expect(badge(s)).toBeNull();
    expect(labels(s)).toEqual([]);
    expect(aura()).toBeDefined();
    s.store.getState().updateTokens([{ id: 'hero', changes: { offMap: undefined } }]);
    expect(bodies(s)).toHaveLength(1);
    expect(badge(s)).toEqual(badgeOf(cell(4, 4)));
  });

  it('is written again in the map\'s distances when the rules change', () => {
    const { s } = scene();
    s.measure.measurementSettingsProvider = () => ({ ...FEET, unitDistance: 10 });
    s.measure.rulesChanged();
    // 10 ft is one cell now.
    expect(labels(s)).toEqual(['10ft']);
    expect(end(s)).toEqual({ x: 6 * GRID, y: cell(4, 4).y });
  });
});

describe('the handles of an aura', () => {
  it('changes how far it reaches by its far handle, in whole cells, as one undo step', () => {
    const { s, aura, press, move, up, steps } = scene();
    expect(press(7 * GRID, cell(4, 4).y)).toBe(true);
    move(7 * GRID + 80, cell(4, 4).y + 200);
    expect(aura()).toMatchObject({ follows: 'hero', aura: 15, points: [cell(4, 4), { x: cell(4, 4).x + RIM + 3 * GRID, y: cell(4, 4).y }] });
    expect(end(s)).toEqual({ x: 8 * GRID, y: cell(4, 4).y });
    expect(labels(s)).toEqual(['15ft']);
    move(0, cell(4, 4).y);
    expect(aura()?.aura).toBe(5);
    move(7 * GRID + 33, cell(4, 4).y, true);
    expect(aura()?.aura).toBe(12.5);
    up();
    expect(steps()).toBe(1);
    expect(s.store.getState().measurePopover).toBeNull();
  });

  it('puts the reach back when the drag is cancelled, and leaves no undo step', () => {
    const { s, aura, press, move, steps } = scene();
    const before = aura();
    press(7 * GRID, cell(4, 4).y);
    move(7 * GRID + 150, cell(4, 4).y);
    expect(aura()?.aura).toBe(20);
    expect(s.measure.handles.handleEscape()).toBe(true);
    expect(aura()).toEqual(before);
    expect(steps()).toBe(0);
  });

  it('moves nothing by its badge, which belongs to its token\'s place: a drag does nothing, a click opens its popover', () => {
    const { s, id, aura, press, move, up, steps } = scene();
    const before = aura();
    const at = badgeOf(cell(4, 4));
    expect(press(at.x, at.y)).toBe(true);
    move(at.x + 200, at.y + 90);
    expect(s.measure.handles.dragging).toBe(false);
    up();
    expect(aura()).toBe(before);
    expect(s.store.getState().measurePopover).toBeNull();
    expect(steps()).toBe(0);
    press(at.x, at.y);
    up();
    expect(s.store.getState().measurePopover).toBe(id);
  });

  it('says what a drag changes without a pointer: nothing for an aura\'s badge or one without a place', () => {
    const { aura } = scene();
    const measure = aura()!;
    expect(handleDrag(measure, 'origin', () => null, null)).toBeNull();
    expect(handleDrag(measure, 'end', () => null, null)).toBeNull();
    expect(sameDragChanges({ aura: 5, points: [{ x: 1, y: 2 }] }, { aura: 5, points: [{ x: 1, y: 2 }] })).toBe(true);
    expect(sameDragChanges({ aura: 5, points: [{ x: 1, y: 2 }] }, { aura: 10, points: [{ x: 1, y: 2 }] })).toBe(false);
    expect(sameDragChanges({ points: [{ x: 1, y: 2 }] }, { points: [{ x: 1, y: 3 }] })).toBe(false);
  });
});

describe('who is shown an aura', () => {
  const view: MeasurePlayersView = { footprints: () => [], seenAtStart: () => () => true, seenOnCanvas: () => null };
  const shown = (s: MeasureScene, seen: (id: string) => boolean): { bodies: number; labels: string[] } => {
    let result = { bodies: 0, labels: [] as string[] };
    captureWithLayerVisibility(s.measure.getPlayerViewLayers(seen), () => undefined, () => {
      result = { bodies: bodies(s).length, labels: labels(s) };
    });
    return result;
  };

  it('is in the players\' picture while they see its token, and never when it is the GM\'s own', () => {
    const { s, id } = scene();
    s.measure.playersView = view;
    expect(shown(s, () => true)).toEqual({ bodies: 1, labels: ['10ft'] });
    expect(shown(s, (token) => token !== 'hero')).toEqual({ bodies: 0, labels: [] });
    s.store.getState().updateMeasure(id, { hidden: true });
    expect(shown(s, () => true)).toEqual({ bodies: 0, labels: [] });
    // The GM's canvas shows it all the while.
    expect(bodies(s)).toHaveLength(1);
  });

  it('is not passed on to players elsewhere, who would be told a circle where it was last edited', () => {
    const { s } = scene();
    s.store.getState().addMeasure({ shape: 'circle', points: [cell(1, 1), cell(3, 1)] });
    expect(s.measure.measurements.get().kept.map(({ follows }) => follows)).toEqual([undefined]);
  });
});
