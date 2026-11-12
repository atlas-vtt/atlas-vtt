// @vitest-environment jsdom
import { Container, Text } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridGeometry } from '../../../src/app/grid/gridDistance';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { measureLabelText } from '../../../src/app/measure/measureLabelText';
import { legDistances, measureDistance } from '../../../src/app/pixi/measure/measureDistances';
import type { HeightAt } from '../../../src/app/measure/tokenHeight';
import { followTokenHeights, measureHeightAt } from '../../../src/app/pixi/measureTokenHeights';
import type { DiagonalRule } from '../../../src/app/types/collectionSettingsTypes';
import type { MeasurePlayersView } from '../../../src/app/pixi/measurePartsVisibility';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
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

/** A ruler's distance as its label and its popover say it. */
const pathDistance = (grid: GridGeometry, points: readonly { x: number; y: number }[], settings: MeasurementSettings, heightAt?: HeightAt): string =>
  measureDistance(grid, { shape: 'ruler', points }, settings, heightAt);

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

    // A circle of four cells around the hero, with the hero and the flier on its edge in it: its size is its size, whatever stands how high.
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 300, 40);
    expect(s.liveLabels()[0]!.text).toBe('20ft · 2');
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
  /** The labels that show on the canvas now: a label hidden within its measurement is none. */
  const shown = (s: MeasureScene): string[] => {
    const found: string[] = [];
    const walk = (node: Container): void => {
      if (!node.visible) return;
      if (node instanceof Text && node.text !== '') found.push(node.text);
      node.children.forEach(walk);
    };
    walk(s.viewport.getChildByLabel('measure-labels')!);
    return found;
  };
  /** What a players' frame shows of the labels, by the tokens the players see. */
  const inFrame = (s: MeasureScene, seen: (id: string) => boolean): string[] => {
    let framed: string[] = [];
    captureWithLayerVisibility(s.measure.getPlayerViewLayers(seen), () => undefined, () => { framed = shown(s); });
    return framed;
  };
  const view = (onCanvas: ((id: string) => boolean) | null): MeasurePlayersView => ({ footprints: () => [], seenAtStart: () => () => true, seenOnCanvas: () => onCanvas });

  it('counts for the players only the height of a token they see: a hidden flier adds nothing to their label', () => {
    // A flier 30 ft up, three cells from the hero: 15 ft on the floor.
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 3, 0, { elevation: 30, isHidden: true })]);
    s.measure.playersView = view(null);
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 230, 40);
    expect(shown(s)).toEqual(['35ft']);
    expect(inFrame(s, (id) => id !== 'wyvern')).toEqual(['15ft']);
    // Once they see it, their label is the GM's.
    expect(inFrame(s, () => true)).toEqual(['35ft']);
    // The frame leaves the GM's canvas as it was.
    expect(shown(s)).toEqual(['35ft']);
    // Moved on to the floor beside it, both read the same again.
    s.pointer('pointermove', 300, 40);
    expect(shown(s)).toEqual(['20ft']);
    expect(inFrame(s, (id) => id !== 'wyvern')).toEqual(['20ft']);
  });

  it('reads the token the players see under a ruler\'s end where one they do not see lies on top of it', () => {
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 3, 0, { elevation: 30 }), token('ghost', 3, 0, { elevation: 10, isHidden: true, layer: 2 })]);
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 230, 40);
    expect(shown(s)).toEqual(['20ft']);
    expect(inFrame(s, (id) => id !== 'ghost')).toEqual(['35ft']);
  });

  it('keeps a kept ruler\'s label for the players as it is when a flier they do not see moves under its end, in a frame and in session view', () => {
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 7, 5, { elevation: 30, isHidden: true })]);
    let onCanvas: ((id: string) => boolean) | null = null;
    s.measure.playersView = { ...view(null), seenOnCanvas: () => onCanvas };
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 20, 20, 230, 40);
    expect(shown(s)).toEqual(['15ft']);

    s.store.getState().updateTokens([{ id: 'wyvern', changes: cell(3, 0) }]);
    expect(shown(s)).toEqual(['35ft']);
    const players = (id: string): boolean => id !== 'wyvern';
    expect(inFrame(s, players)).toEqual(['15ft']);
    expect(shown(s)).toEqual(['35ft']);

    // Session view: the canvas shows what the players see.
    onCanvas = players;
    s.measure.refreshVisibility();
    expect(shown(s)).toEqual(['15ft']);
    s.store.getState().updateTokens([{ id: 'wyvern', changes: { elevation: 60 } }]);
    expect(shown(s)).toEqual(['15ft']);
    // Shown to the players, the flier counts for them from then on.
    onCanvas = () => true;
    s.measure.refreshVisibility();
    expect(shown(s)).toEqual(['65ft']);
    onCanvas = null;
    s.measure.refreshVisibility();
    expect(shown(s)).toEqual(['65ft']);
    s.stop();
  });

  it('writes the players\' label once for one height, however many frames ask for it', () => {
    const s = sceneWith([token('hero', 0, 0), token('wyvern', 3, 0, { elevation: 30, isHidden: true })]);
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 20, 20, 230, 40);
    const players = (id: string): boolean => id !== 'wyvern';
    expect(inFrame(s, players)).toEqual(['15ft']);
    const labels = s.viewport.getChildByLabel('measure-labels')!;
    const written = (): Text[] => {
      const found: Text[] = [];
      const walk = (node: Container): void => {
        if (node instanceof Text) found.push(node);
        node.children.forEach(walk);
      };
      walk(labels);
      return found;
    };
    const before = written().map((text) => text.text);
    const sets = written().map((text) => vi.spyOn(text, 'text', 'set'));
    for (let frame = 0; frame < 5; frame++) expect(inFrame(s, players)).toEqual(['15ft']);
    expect(sets.every((set) => set.mock.calls.length === 0)).toBe(true);
    expect(written().map((text) => text.text)).toEqual(before);
    s.stop();
  });
});
