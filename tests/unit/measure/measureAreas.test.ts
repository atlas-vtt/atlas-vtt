// @vitest-environment jsdom
import { Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { MAP_LAYER_Z } from '../../../src/app/pixi/mapLayerOrder';
import { placeUnderTokens } from '../../../src/app/pixi/measure/MeasureLayer';
import type { MeasurePlayersView } from '../../../src/app/pixi/measurePartsVisibility';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import type { TokenEntity } from '../../../src/app/types';
import { GRID, measureFrom, measureScene, type MeasureScene } from '../../helpers/measureScene';

let current: MeasureScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, rangeBands: [], coneAngle: 90, diagonalRule: 'equidistant' };
const cell = (col: number, row: number): { x: number; y: number } => ({ x: col * GRID + GRID / 2, y: row * GRID + GRID / 2 });
const token = (id: string, col: number, row: number, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, imagePath: '', ...cell(col, row), ...more });

/** A map of 70 px cells that counts 5 ft a cell, with `tokens` on it and the measure tool in hand. */
function scene(tokens: TokenEntity[] = []): MeasureScene {
  const s = measureScene();
  current = s;
  s.measure.measurementSettingsProvider = () => FEET;
  s.store.setState({ objects: { ...s.store.getState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });
  s.store.getState().setActiveTool('measure');
  return s;
}

/** The rings on tokens: every line of ink on the shared surface while no ruler is drawn. */
const rings = (s: MeasureScene): Container[] => s.viewport.getChildByLabel('measures')?.getChildByLabel('measure-lines')?.children ?? [];
const bodies = (s: MeasureScene): Container => s.viewport.getChildByLabel('measure-bodies')!;
const labels = (s: MeasureScene): string[] => s.liveLabels().filter(({ view }) => view.visible).map(({ text }) => text);

/** What a players' frame shows of the live labels and the rings, by what the players see. */
function inFrame(s: MeasureScene, seen: (id: string) => boolean): { labels: string[]; rings: number } {
  let shown = { labels: [] as string[], rings: 0 };
  captureWithLayerVisibility(s.measure.getPlayerViewLayers(seen), () => undefined, () => {
    shown = { labels: labels(s), rings: rings(s).filter((ring) => ring.visible).length };
  });
  return shown;
}

describe('an area\'s size', () => {
  it('reads the same in every direction: a circle of four squares is 20 ft, straight or across', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.pointer('pointerdown', 700, 700);
    for (const [x, y] of [[980, 700], [700, 420], [900, 900], [505, 895], [960, 590]]) {
      s.pointer('pointermove', x!, y!);
      expect(labels(s)).toEqual(['20ft']);
    }
  });

  it('names a square and a line by length and width', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode: 'square' });
    s.pointer('pointerdown', 105, 105);
    s.pointer('pointermove', 315, 105);
    expect(labels(s)).toEqual(['15 × 15ft']);
    s.pointer('pointerup', 315, 105);
    s.store.getState().setMeasureTool({ mode: 'line', lineWidth: 2 });
    s.pointer('pointerdown', 105, 385);
    s.pointer('pointermove', 525, 385);
    expect(labels(s)).toEqual(['30 × 10ft']);
  });
});

describe('the tokens in an area', () => {
  const PARTY = [token('hero', 2, 2), token('goblin', 4, 2), token('ghost', 3, 3, { isHidden: true }), token('far', 9, 9)];

  it('are ringed and counted while the area is made, hidden ones too, and no longer once it is gone', () => {
    const s = scene(PARTY);
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.pointer('pointerdown', 245, 245);
    s.pointer('pointermove', 245, 385);
    expect(labels(s)).toEqual(['10ft · 3']);
    expect(rings(s)).toHaveLength(3);
    // A token that walks out of it is counted out at once.
    s.store.getState().updateToken('goblin', cell(8, 2));
    expect(labels(s)).toEqual(['10ft · 2']);
    expect(rings(s)).toHaveLength(2);
    s.key('Escape');
    expect(rings(s)).toHaveLength(0);
  });

  it('show the players only the tokens they see: a ring on each, and their number in the label\'s place', () => {
    const s = scene(PARTY);
    const view: MeasurePlayersView = { footprints: () => [], seenAtStart: () => () => true, seenOnCanvas: () => null };
    s.measure.playersView = view;
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.pointer('pointerdown', 245, 245);
    s.pointer('pointermove', 245, 385);
    expect(inFrame(s, (id) => id === 'hero')).toEqual({ labels: ['10ft · 1'], rings: 1 });
    expect(inFrame(s, () => false)).toEqual({ labels: ['10ft'], rings: 0 });
    expect(inFrame(s, () => true)).toEqual({ labels: ['10ft · 3'], rings: 3 });
    // The frame leaves the GM's canvas as it was.
    expect(labels(s)).toEqual(['10ft · 3']);
    expect(rings(s).filter((ring) => ring.visible)).toHaveLength(3);
    // A picture of the scene has the measurement and its count, and no rings.
    captureWithLayerVisibility(s.measure.getGmViewLayers(), () => undefined, () => {
      expect(labels(s)).toEqual(['10ft · 3']);
      expect(rings(s).filter((ring) => ring.visible)).toHaveLength(0);
    });
  });

  it('are marked on a kept area only while its handle is under the pointer or its popover is open, and are what it selects', () => {
    const s = scene(PARTY);
    s.store.getState().setMeasureTool({ mode: 'circle', keep: true });
    measureFrom(s, 245, 245, 245, 385);
    s.store.getState().setActiveTool('select');
    const [id] = Object.keys(s.store.getState().objects.measures ?? {});
    expect(rings(s)).toHaveLength(0);
    expect(s.measure.tokensIn(id!)).toEqual(['hero', 'goblin', 'ghost']);
    s.measure.handles.pointer.cursorAt(245, 245);
    expect(rings(s)).toHaveLength(3);
    s.measure.handles.pointer.leave();
    expect(rings(s)).toHaveLength(0);
    s.store.getState().openMeasurePopover(id!);
    expect(rings(s)).toHaveLength(3);
    s.store.getState().closeMeasurePopover();
    expect(rings(s)).toHaveLength(0);
  });

  it('are the GM\'s own look on a kept area: the players\' picture has no ring and counts none while the GM points at it', () => {
    const s = scene(PARTY);
    s.measure.playersView = { footprints: () => [], seenAtStart: () => () => true, seenOnCanvas: () => null };
    s.store.getState().setMeasureTool({ mode: 'circle', keep: true });
    measureFrom(s, 245, 245, 245, 385);
    s.store.getState().setActiveTool('select');
    const [id] = Object.keys(s.store.getState().objects.measures ?? {});
    const kept = (): string[] => {
      const texts: string[] = [];
      const walk = (node: Container): void => {
        if (!node.visible) return;
        if ('text' in node && typeof node.text === 'string' && node.text !== '') texts.push(node.text);
        node.children.forEach(walk);
      };
      walk(s.viewport.getChildByLabel('measure-labels')!);
      return texts;
    };
    const frame = (): { labels: string[]; rings: number } => {
      let shown = { labels: [] as string[], rings: 0 };
      captureWithLayerVisibility(s.measure.getPlayerViewLayers(() => true), () => undefined, () => {
        shown = { labels: kept(), rings: rings(s).filter((ring) => ring.visible).length };
      });
      return shown;
    };
    for (const point of [(): void => { s.measure.handles.pointer.cursorAt(245, 245); }, (): void => s.store.getState().openMeasurePopover(id!)]) {
      point();
      expect(rings(s).filter((ring) => ring.visible)).toHaveLength(3);
      expect(kept()).toEqual(['10ft · 3']);
      expect(frame()).toEqual({ labels: ['10ft'], rings: 0 });
      // The frame leaves the GM's canvas as it was.
      expect(rings(s).filter((ring) => ring.visible)).toHaveLength(3);
      expect(kept()).toEqual(['10ft · 3']);
      s.measure.handles.pointer.leave();
      s.store.getState().closeMeasurePopover();
    }
  });
});

describe('an area and the walls', () => {
  /** A wall down the line between the columns 3 and 4, from the top of the map to far below. */
  const wall = { type: 'solid' as const, p1: { x: 280, y: -700 }, p2: { x: 280, y: 2100 } };

  it('stops at them while it is made, counts no token behind them, and is cut again when a door opens', () => {
    const s = scene([token('hero', 2, 2), token('goblin', 4, 2)]);
    const door = s.store.getState().addWall({ ...wall, type: 'door', closed: true });
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.pointer('pointerdown', 245, 245);
    s.pointer('pointermove', 245, 455);
    expect(labels(s)).toEqual(['15ft · 1']);
    s.store.getState().updateWall(door, { closed: false });
    expect(labels(s)).toEqual(['15ft · 2']);
  });

  it('passes them once its switch is off, kept', () => {
    const s = scene([token('hero', 2, 2), token('goblin', 4, 2)]);
    s.store.getState().addWall(wall);
    s.store.getState().setMeasureTool({ mode: 'circle', keep: true });
    measureFrom(s, 245, 245, 245, 455);
    const [id] = Object.keys(s.store.getState().objects.measures ?? {});
    expect(s.measure.tokensIn(id!)).toEqual(['hero']);
    s.store.getState().updateMeasure(id!, { walls: false });
    expect(s.measure.tokensIn(id!)).toEqual(['hero', 'goblin']);
  });

  it('tells whoever passes measurements on whether walls stand on the level', () => {
    const s = scene();
    expect(s.measure.measurements.get().walled).toBe(false);
    const id = s.store.getState().addWall(wall);
    expect(s.measure.measurements.get().walled).toBe(true);
    s.store.getState().deleteWall(id);
    expect(s.measure.measurements.get().walled).toBe(false);
  });
});

describe('the layer of the areas\' bodies', () => {
  it('lies right under the tokens: above the map and the grid, which are put in beneath it', () => {
    const parent = new Container({ sortableChildren: true });
    const [map, grid, tokens, pins, layer] = ['map', 'grid', 'tokenContainer', 'pins', 'bodies'].map((label) => new Container({ label }));
    map!.zIndex = -2;
    pins!.zIndex = 98;
    layer!.zIndex = MAP_LAYER_Z.measureBodies;
    parent.addChild(map!, grid!, tokens!, pins!);
    placeUnderTokens(parent, layer!);
    parent.sortChildren();
    expect(parent.children.map((child) => child.label)).toEqual(['map', 'grid', 'bodies', 'tokenContainer', 'pins']);
    // A grid drawn anew is put in right above the map, and stays beneath the bodies.
    parent.removeChild(grid!);
    parent.addChildAt(grid!, parent.getChildIndex(map!) + 1);
    parent.sortChildren();
    expect(parent.children.map((child) => child.label)).toEqual(['map', 'grid', 'bodies', 'tokenContainer', 'pins']);
  });

  it('holds a body for an area and none for a ruler, hidden with its measurement', () => {
    const s = scene();
    const drawn = (): number => bodies(s).children.filter((body) => body.visible && body.getLocalBounds().width > 0).length;
    s.pointer('pointerdown', 105, 105);
    s.pointer('pointermove', 315, 105);
    expect(drawn()).toBe(0);
    s.pointer('pointerup', 315, 105);
    s.store.getState().setMeasureTool({ mode: 'cone', players: false });
    s.pointer('pointerdown', 105, 385);
    s.pointer('pointermove', 385, 385);
    expect(drawn()).toBe(1);
    // The GM measures for themselves: the players' frame has no body of it.
    captureWithLayerVisibility(s.measure.getPlayerViewLayers(() => true), () => undefined, () => expect(drawn()).toBe(0));
    expect(drawn()).toBe(1);
  });
});
