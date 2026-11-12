// @vitest-environment jsdom
import { Container, Text } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridGeometry } from '../../../src/app/grid/gridDistance';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { measureLabelText } from '../../../src/app/measure/measureLabelText';
import { legDistances, pathDistance } from '../../../src/app/pixi/measure/measureDistances';
import { followTokenHeights, measureHeightAt } from '../../../src/app/pixi/measureTokenHeights';
import type { DiagonalRule } from '../../../src/app/types/collectionSettingsTypes';
import type { TokenEntity } from '../../../src/app/types';
import { measureFrom, measureScene, type MeasureScene } from '../../helpers/measureScene';

const GRID: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const feet = (diagonalRule: DiagonalRule = 'alternating'): MeasurementSettings => (
  { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule, rangeBands: [], coneAngle: 90 }
);
const cell = (col: number, row: number): { x: number; y: number } => ({ x: 35 + col * 70, y: 35 + row * 70 });
const token = (id: string, col: number, row: number, more: Partial<TokenEntity> = {}): TokenEntity => (
  { id, kind: 'character', name: id, imagePath: '', ...cell(col, row), ...more }
);

describe('a ruler between two heights', () => {
  /** A flier 20 ft up at the cell (4, 0), another 10 ft up at (2, 2), everything else on the floor. */
  const heightAt = ({ x, y }: { x: number; y: number }): number => (x === cell(4, 0).x && y === cell(4, 0).y ? 20 : x === cell(2, 2).x && y === cell(2, 2).y ? 10 : 0);

  it('counts the height between its ends by the diagonal rule', () => {
    const toFlier = [cell(0, 0), cell(4, 0)];
    expect((['equidistant', 'alternating', 'manhattan', 'euclidean'] as const).map((rule) => pathDistance(GRID, toFlier, feet(rule), heightAt)))
      .toEqual(['20ft', '30ft', '40ft', '28.3ft']);
    expect(pathDistance(GRID, [...toFlier].reverse(), feet(), heightAt)).toBe('30ft');
    // From one flier to the other only the 10 ft between them count.
    expect(pathDistance(GRID, [cell(2, 2), cell(4, 0)], feet('manhattan'), heightAt)).toBe('30ft');
    expect(measureLabelText({ shape: 'ruler', points: toFlier }, GRID, feet(), 0, 4)).toBe('30ft');
  });

  it('counts it once over a path with corners, whose legs keep their length on the floor', () => {
    // Past the lower flier, which is a corner and not an end.
    const path = [cell(0, 0), cell(2, 2), cell(4, 0)];
    expect(pathDistance(GRID, path, feet(), heightAt)).toBe('30ft');
    expect(pathDistance(GRID, path, feet('manhattan'), heightAt)).toBe('60ft');
    expect(legDistances(GRID, path, feet()).map(({ distance }) => distance)).toEqual(['15ft', '15ft']);
  });

  it('writes exactly what it wrote before where no end is off the floor, and for an area', () => {
    const paths = [[cell(0, 0), cell(3, 2)], [cell(1, 1), cell(2, 2), cell(6, 3)], [cell(5, 5), cell(5, 5)], [{ x: 12.5, y: 80 }, { x: 301, y: 77.7 }]];
    for (const rule of ['equidistant', 'alternating', 'manhattan', 'euclidean'] as const) {
      for (const path of paths) {
        expect(pathDistance(GRID, path, feet(rule), heightAt)).toBe(pathDistance(GRID, path, feet(rule)));
        expect(pathDistance(GRID, path, feet(rule), () => 0)).toBe(pathDistance(GRID, path, feet(rule)));
      }
    }
    expect(measureLabelText({ shape: 'circle', points: [cell(0, 0), cell(4, 0)] }, GRID, feet(), 0, 4)).toBe('20ft');
  });

  it('counts none where the map measures in range bands', () => {
    const bands: MeasurementSettings = { ...feet(), mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 4 }, { name: 'Far', maxSquares: 9 }] };
    expect(pathDistance(GRID, [cell(0, 0), cell(4, 0)], bands, heightAt)).toBe('Close');
  });
});

describe('the measure tool on a map with fliers', () => {
  let scene: MeasureScene | undefined;
  afterEach(() => {
    scene?.destroy();
    scene = undefined;
    vi.useRealTimers();
  });

  function sceneWith(tokens: TokenEntity[]): MeasureScene & { redraws: () => number; stop: () => void } {
    const made = measureScene();
    scene = made;
    made.measure.measurementSettingsProvider = () => feet();
    made.store.setState({ objects: { ...made.store.getState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });
    made.measure.heightAt = measureHeightAt(made.store, { getOptions: () => GRID });
    const redraw = vi.spyOn(made.measure, 'rulesChanged');
    const stop = followTokenHeights(made.store, () => made.measure.rulesChanged());
    made.store.getState().setActiveTool('measure');
    return Object.assign(made, { redraws: () => redraw.mock.calls.length, stop });
  }

  /** The text of every label that shows. */
  const texts = (s: MeasureScene): string[] => s.parts().filter((part) => part.visible).flatMap((part) => {
    const found: string[] = [];
    const walk = (node: unknown): void => {
      if (node instanceof Text) found.push(node.text);
      else if (node instanceof Container) node.children.forEach(walk);
    };
    walk(part);
    return found.filter((text) => text !== '');
  });

  it('adds the height of the token a ruler ends on, and nothing for a circle', () => {
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 4, 0, { elevation: 20 }), token('ogre', 4, 3, { size: 2, elevation: 20 })]);
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 300, 40);
    expect(s.liveLabels()[0]!.text).toBe('30ft');
    // Beside the flier: the floor.
    s.pointer('pointermove', 370, 40);
    expect(s.liveLabels()[0]!.text).toBe('25ft');
    // The corner cell (5, 2) of the 3×3 flier around (4, 3), which its round art does not reach: 30 ft on the floor.
    s.pointer('pointermove', 5 * 70 + 10, 2 * 70 + 10);
    expect(s.liveLabels()[0]!.text).toBe('35ft');
    s.pointer('pointerup', 5 * 70 + 10, 2 * 70 + 10);

    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 300, 40);
    expect(s.liveLabels()[0]!.text).toBe('20ft');
  });

  it('reads the token lying on top where two share a cell, and a hidden one like any other', () => {
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 4, 0, { elevation: 20 }), token('archer', 4, 0, { layer: 3 }), token('ghost', 0, 2, { elevation: 10, isHidden: true })]);
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 300, 40);
    expect(s.liveLabels()[0]!.text).toBe('20ft');
    s.pointer('pointermove', 20, 160);
    expect(s.liveLabels()[0]!.text).toBe('15ft');
  });

  it('writes a kept ruler again when the flier it ends on rises, leaves or lands', () => {
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 4, 0, { elevation: 20 })]);
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 20, 20, 300, 40);
    expect(texts(s)).toEqual(['30ft']);

    // 40 ft up, 20 ft across: the four steps across are taken while climbing.
    s.store.getState().updateTokens([{ id: 'wyvern', changes: { elevation: 40 } }]);
    expect(texts(s)).toEqual(['50ft']);
    s.store.getState().updateTokens([{ id: 'wyvern', changes: { x: cell(7, 5).x, y: cell(7, 5).y } }]);
    expect(texts(s)).toEqual(['20ft']);
    s.store.getState().updateTokens([{ id: 'wyvern', changes: { ...cell(4, 0), elevation: undefined } }]);
    expect(texts(s)).toEqual(['20ft']);
    s.stop();
  });

  it('draws nothing again for what tokens on the floor do', () => {
    const s = sceneWith([token('hero', 0, 0), token('goblin', 4, 0)]);
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 20, 20, 300, 40);
    s.store.getState().updateTokens([{ id: 'goblin', changes: { x: 500, y: 500 } }]);
    s.store.getState().updateTokens([{ id: 'hero', changes: { size: 2 } }]);
    s.store.getState().setSelection(['hero']);
    expect(s.redraws()).toBe(0);
    // The first token to leave the floor is a change; one that follows it another.
    s.store.getState().updateTokens([{ id: 'goblin', changes: { elevation: 5 } }]);
    expect(s.redraws()).toBe(1);
    s.store.getState().updateTokens([{ id: 'hero', changes: { x: 105 } }]);
    expect(s.redraws()).toBe(1);
    s.store.getState().updateTokens([{ id: 'goblin', changes: { x: 570 } }]);
    expect(s.redraws()).toBe(2);
    s.stop();
    s.store.getState().updateTokens([{ id: 'goblin', changes: { elevation: 50 } }]);
    expect(s.redraws()).toBe(2);
  });
});
