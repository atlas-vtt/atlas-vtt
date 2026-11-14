// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { NO_MOVEMENT_RULES, type MovementRules } from '../../../src/app/measure/movementRules';
import { tokenStandingAt } from '../../../src/app/measure/tokenDistance';
import type { MeasurePlayersView } from '../../../src/app/pixi/measurePartsVisibility';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import { GRID, measureScene, type MeasureScene } from '../../helpers/measureScene';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const BANDED: MeasurementSettings = {
  ...FEET,
  mode: 'abstract',
  rangeBands: [{ name: 'Melee', maxSquares: 1 }, { name: 'Close', maxSquares: 3 }, { name: 'Far', maxSquares: 6 }, { name: 'Very Far', maxSquares: 7 }],
};
const MOVES: MovementRules = { steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }, { name: 'Dash', multiple: 2, color: '#eab308' }], countPerTurn: false };
/** The middle of the cell (col, row). */
const cell = (col: number, row: number): { x: number; y: number } => ({ x: (col + 0.5) * GRID, y: (row + 0.5) * GRID });
const HERO = { id: 'hero', ...cell(1, 1) };
const GOBLIN = { id: 'goblin', ...cell(5, 1) };
const OGRE = { id: 'ogre', ...cell(5, 5) };

interface RangeScene extends MeasureScene {
  /** What the map measures in and moves by, and each token's speed; changed in place by a test. */
  rules: { settings: MeasurementSettings; movement: MovementRules; speeds: Record<string, number> };
  prepared: string[];
  hover(at: { x: number; y: number }): void;
  press(at: { x: number; y: number }, button?: number): void;
}

let current: RangeScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

/** The measure tool in hand on a map with three tokens, the range marks wired to them as the map wires them. */
function scene(settings: MeasurementSettings = FEET, movement: MovementRules = NO_MOVEMENT_RULES): RangeScene {
  const s = measureScene();
  const rules: RangeScene['rules'] = { settings, movement, speeds: { hero: 30 } };
  const prepared: string[] = [];
  for (const token of [HERO, GOBLIN, OGRE]) s.store.getState().addToken({ kind: 'token', imagePath: '', size: 1, ...token } as TokenEntity);
  s.measure.measurementSettingsProvider = () => rules.settings;
  s.measure.rangeSources = {
    tokenAt: (x, y) => tokenStandingAt({ x, y }, Object.values(s.store.getState().objects.tokens), { type: 'square', size: GRID, offsetX: 0, offsetY: 0 })?.id ?? null,
    movement: {
      rules: () => rules.movement,
      speedOf: (token) => rules.speeds[(token as TokenEntity).id] ?? null,
      prepare: (tokens) => { prepared.push(...[...tokens].map((token) => (token as TokenEntity).id)); },
    },
  };
  s.store.getState().setActiveTool('measure');
  current = Object.assign(s, {
    rules,
    prepared,
    hover: (at: { x: number; y: number }): void => s.pointer('pointermove', at.x, at.y),
    press: (at: { x: number; y: number }, button = 0): void => s.pointer('pointerdown', at.x, at.y, { button }),
  });
  return current;
}

const check = (s: RangeScene): string => s.measure.ranges.texts.check;
const rings = (s: RangeScene): readonly string[] => s.measure.ranges.texts.rings;
/** The middle of the rings' labels, which stand on their rings. */
const middle = (s: RangeScene): number => {
  const bounds = s.measure.ranges.view.getChildByLabel('range-ring-labels', true)!.getLocalBounds();
  return bounds.x + bounds.width / 2;
};
/** Nothing is being measured and nothing was kept. */
const nothingMeasured = (s: RangeScene): boolean => s.measure.measurements.get().live === null && s.measure.measurements.get().kept.length === 0;

describe('the range check', () => {
  it('reads the distance from the one selected token to the token under the pointer, and goes when the hover ends', () => {
    const s = scene();
    s.hover(GOBLIN);
    expect(check(s)).toBe('');
    s.store.getState().setSelection(['hero']);
    s.hover(GOBLIN);
    expect(check(s)).toBe('20ft');
    s.hover(OGRE);
    expect(check(s)).toBe('20ft');
    s.hover(cell(3, 3));
    expect(check(s)).toBe('');
    s.hover(HERO);
    expect(check(s)).toBe('');
  });

  it('reads the band where the map measures in bands, and follows the rules as they change', () => {
    const s = scene(BANDED);
    s.store.getState().setSelection(['hero']);
    s.hover(GOBLIN);
    expect(check(s)).toBe('Far');
    s.rules.settings = FEET;
    s.measure.rulesChanged();
    expect(check(s)).toBe('20ft');
  });

  it('needs exactly one token selected, and follows the selection', () => {
    const s = scene();
    s.store.getState().setSelection(['hero', 'ogre']);
    s.hover(GOBLIN);
    expect(check(s)).toBe('');
    s.store.getState().setSelection(['ogre']);
    expect(check(s)).toBe('20ft');
    s.store.getState().setSelection(['goblin']);
    expect(check(s)).toBe('');
    s.store.getState().clearSelection();
    expect(check(s)).toBe('');
  });

  it('follows a token that moves, and goes with one that is deleted', () => {
    const s = scene();
    s.store.getState().setSelection(['hero']);
    s.hover(GOBLIN);
    s.store.getState().updateToken('hero', { ...cell(4, 1) });
    expect(check(s)).toBe('5ft');
    s.store.getState().deleteToken('goblin');
    expect(check(s)).toBe('');
  });

  it('goes when a measurement starts, shows none while one is made, and goes with the tool', () => {
    const s = scene();
    s.store.getState().setSelection(['hero']);
    s.hover(GOBLIN);
    s.press(GOBLIN);
    expect(check(s)).toBe('');
    expect(s.measure.measurements.get().live?.shape).toBe('ruler');
    s.hover(OGRE);
    expect(check(s)).toBe('');
    s.pointer('pointerup', OGRE.x, OGRE.y);
    s.hover(GOBLIN);
    expect(check(s)).toBe('20ft');
    s.store.getState().setActiveTool('select');
    expect(check(s)).toBe('');
    // Without the tool nothing is hovered at all.
    s.hover(GOBLIN);
    expect(check(s)).toBe('');
  });

  it('writes nothing: no object changes and no undo step', () => {
    const s = scene();
    s.store.getState().setSelection(['hero']);
    const before = s.store.getState().objects;
    const steps = getHistoryStore(s.store).getState().pastStates.length;
    s.hover(GOBLIN);
    s.hover(OGRE);
    s.hover(cell(8, 8));
    expect(s.store.getState().objects).toBe(before);
    expect(getHistoryStore(s.store).getState().pastStates).toHaveLength(steps);
    expect(nothingMeasured(s)).toBe(true);
  });

  it('asks for the speed of a token the pointer comes over, ahead of a press', () => {
    const s = scene();
    s.hover(GOBLIN);
    s.hover(GOBLIN);
    s.hover(OGRE);
    expect(s.prepared).toEqual(['goblin', 'ogre']);
  });
});

describe('the Ranges mode', () => {
  const ranges = (settings: MeasurementSettings = BANDED, movement: MovementRules = NO_MOVEMENT_RULES): RangeScene => {
    const s = scene(settings, movement);
    s.store.getState().setMeasureTool({ mode: 'ranges' });
    return s;
  };

  it('shows the map\'s bands around a pressed token or point, and starts no measurement', () => {
    const s = ranges();
    const before = s.store.getState().objects;
    s.press(GOBLIN);
    expect(rings(s)).toEqual(['Melee', 'Close', 'Far']);
    s.pointer('pointermove', GOBLIN.x + 200, GOBLIN.y);
    s.pointer('pointerup', GOBLIN.x + 200, GOBLIN.y);
    s.press(cell(8, 3));
    expect(rings(s)).toEqual(['Melee', 'Close', 'Far']);
    expect(nothingMeasured(s)).toBe(true);
    expect(s.store.getState().objects).toBe(before);
  });

  it('takes the rings off the token they stand around when it is pressed again, and moves them to another', () => {
    const s = ranges();
    s.press(GOBLIN);
    const around = middle(s);
    s.press(OGRE);
    expect(rings(s)).toHaveLength(3);
    s.press(HERO);
    expect(middle(s)).toBeCloseTo(around - 4 * GRID, 6);
    s.press(HERO);
    expect(rings(s)).toEqual([]);
    s.press(HERO);
    expect(rings(s)).toHaveLength(3);
  });

  it('shows a token\'s movement steps where the map measures distances, and nothing for a point or a token without a speed', () => {
    const s = ranges(FEET, MOVES);
    s.press(HERO);
    expect(rings(s)).toEqual(['Move · 30ft', 'Dash · 60ft']);
    s.press(cell(8, 3));
    expect(rings(s)).toEqual([]);
    s.press(GOBLIN);
    expect(rings(s)).toEqual([]);
    // A token that had no rings is no target: the next press on it shows them once its speed is known.
    s.rules.speeds.goblin = 40;
    s.press(GOBLIN);
    expect(rings(s)).toEqual(['Move · 40ft', 'Dash · 80ft']);
  });

  it('follows its token when it moves and goes when it is deleted', () => {
    const s = ranges();
    s.press(GOBLIN);
    const around = middle(s);
    s.store.getState().updateToken('goblin', { ...cell(7, 1) });
    expect(rings(s)).toHaveLength(3);
    expect(middle(s)).toBeCloseTo(around + 2 * GRID, 6);
    // Another token's move draws nothing anew.
    const redraw = vi.spyOn(s.measure.ranges, 'redraw');
    s.store.getState().updateToken('ogre', { ...cell(6, 6) });
    expect(middle(s)).toBeCloseTo(around + 2 * GRID, 6);
    expect(redraw).not.toHaveBeenCalled();
    s.store.getState().deleteToken('goblin');
    expect(rings(s)).toEqual([]);
  });

  it('keeps the rings\' labels clear of each other, also where the map is zoomed far out and the rings are small', () => {
    for (const zoom of [1, 0.5, 0.25, 0.12]) {
      const s = ranges();
      s.viewport.scale.set(zoom);
      s.press({ x: GOBLIN.x * zoom, y: GOBLIN.y * zoom });
      const boxes = s.measure.ranges.view.getChildByLabel('range-ring-labels', true)!.children.map((label) => label.getBounds().rectangle);
      expect(boxes).toHaveLength(3);
      boxes.forEach((box, index) => {
        for (const other of boxes.slice(index + 1)) expect(box.intersects(other), `zoom ${zoom}`).toBe(false);
      });
      s.destroy();
    }
    current = undefined;
  });

  it('follows the rules as they change', () => {
    const s = ranges(FEET, MOVES);
    s.press(HERO);
    s.rules.movement = { steps: [{ name: 'Stride', multiple: 1, color: '#22c55e' }], countPerTurn: false };
    s.measure.rulesChanged();
    expect(rings(s)).toEqual(['Stride · 30ft']);
    s.rules.movement = NO_MOVEMENT_RULES;
    s.measure.rulesChanged();
    expect(rings(s)).toEqual([]);
  });

  it('goes on Escape, with another mode, another scene and the tool put away', () => {
    const s = ranges();
    expect(s.measure.ranges.handleEscape()).toBe(false);
    s.press(GOBLIN);
    expect(s.measure.ranges.handleEscape()).toBe(true);
    expect(rings(s)).toEqual([]);
    s.press(GOBLIN);
    s.store.getState().setMeasureTool({ mode: 'ruler' });
    expect(rings(s)).toEqual([]);
    s.store.getState().setMeasureTool({ mode: 'ranges' });
    s.press(GOBLIN);
    s.store.getState().setMapPath('maps/another.atlasmap');
    expect(rings(s)).toEqual([]);
    s.press(GOBLIN);
    s.store.getState().setActiveTool('select');
    expect(rings(s)).toEqual([]);
  });

  it('takes the primary button alone, and no press outside its mode', () => {
    const s = ranges();
    s.press(GOBLIN, 2);
    expect(rings(s)).toEqual([]);
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.press(GOBLIN);
    expect(rings(s)).toEqual([]);
  });
});

describe('the range marks in the players\' picture', () => {
  const players = (canvas: { players: boolean }): MeasurePlayersView => ({
    footprints: () => [],
    seenAtStart: () => () => true,
    seenOnCanvas: () => (canvas.players ? (): boolean => true : null),
  });
  const shownIn = (layers: { layer: unknown; visible: boolean }[], part: unknown): boolean | undefined => layers.find((entry) => entry.layer === part)?.visible;

  it('are in no players\' frame and no picture of the scene, with nothing measured', () => {
    const s = scene(BANDED);
    const { view } = s.measure.ranges;
    expect(shownIn(s.measure.getPlayerViewLayers(() => true), view)).toBe(false);
    expect(shownIn(s.measure.getGmViewLayers(), view)).toBe(false);
  });

  it('hide while the canvas shows the players\' view, where nothing is hovered and no press shows rings', () => {
    const canvas = { players: false };
    const s = scene(BANDED);
    s.measure.playersView = players(canvas);
    s.store.getState().setSelection(['hero']);
    s.store.getState().setMeasureTool({ mode: 'ranges' });
    s.press(GOBLIN);
    expect(s.measure.ranges.view.visible).toBe(true);
    canvas.players = true;
    s.measure.refreshVisibility();
    expect(s.measure.ranges.view.visible).toBe(false);
    s.hover(OGRE);
    expect(check(s)).toBe('');
    s.measure.ranges.handleEscape();
    s.press(OGRE);
    expect(rings(s)).toEqual([]);
    canvas.players = false;
    s.measure.refreshVisibility();
    expect(s.measure.ranges.view.visible).toBe(true);
    s.hover(GOBLIN);
    expect(check(s)).toBe('Far');
  });
});
