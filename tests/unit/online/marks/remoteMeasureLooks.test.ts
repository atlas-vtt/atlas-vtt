// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Graphics, Text, type Ticker } from 'pixi.js';
import { resolveMeasurementSettings, type MeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import type { AuraToken } from '../../../../src/app/measure/auraArea';
import type { FullMeasure } from '../../../../src/app/online/protocol/index.ts';
import { RemoteMeasures, type MeasureRules, type RemoteMeasure } from '../../../../src/app/online/marks/RemoteMeasures.ts';
import type { ViewPlayback } from '../../../../src/app/pixi/liquids/viewLiquids';
import { AreaEffects } from '../../../../src/app/pixi/measure/effects/AreaEffects';
import type { MeasureEffectOptions } from '../../../../src/app/pixi/measure/effects/MeasureEffectMesh';

/** The effect meshes made and not yet destroyed: the shaders themselves are the GPU tests' to draw. */
const meshes = vi.hoisted(() => new Set<{ options: Record<string, unknown> }>());

vi.mock('../../../../src/app/pixi/measure/effects/MeasureEffectMesh', async () => {
  const { Container: Layer } = await import('pixi.js');
  return {
    MeasureEffectMesh: class {
      readonly view = new Layer({ label: 'measure-effect' });
      readonly bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
      options: Record<string, unknown>;
      constructor(options: Record<string, unknown>) {
        this.options = options;
        meshes.add(this);
      }
      update(changes: Record<string, unknown>): void {
        this.options = { ...this.options, ...changes };
      }
      setTime(): void { /* The clock's own test holds what it is told. */ }
      setStill(): void { /* As above. */ }
      destroy(): void {
        meshes.delete(this);
        this.view.destroy();
      }
    },
  };
});

const GM = 'gm';
const HERO = '0123456789abcdef01234567';
const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;
const FEET: MeasurementSettings = { ...resolveMeasurementSettings(undefined, null), mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant' };
const told = (kept: readonly FullMeasure[], live: FullMeasure | null = null): RemoteMeasure => ({ who: GM, color: '#8a5cf5', live: null, kept: [], full: { live, kept } });
const circle: FullMeasure = { shape: 'circle', pts: [350, 350, 490, 350] };
const effectsOf = (): Pick<MeasureEffectOptions, 'effect' | 'color' | 'seed'>[] => [...meshes].map(({ options }) => ({ effect: options.effect, color: options.color, seed: options.seed }) as Pick<MeasureEffectOptions, 'effect' | 'color' | 'seed'>);

/** A view's playback whose ticker only says whether it is asked. */
function playback(): { playback: ViewPlayback; listening: () => boolean } {
  const ticks = new Set<() => void>();
  const ticker = { lastTime: 0, elapsedMS: 1000 / 60, add: (tick: () => void) => ticks.add(tick), remove: (tick: () => void) => ticks.delete(tick) };
  return { playback: { ticker: ticker as unknown as Ticker, requestRender: () => undefined, inView: () => true, fps: () => 30, detail: () => 2, drawable: true }, listening: () => ticks.size > 0 };
}

describe('the looks of the GM\'s measurements, drawn for players', () => {
  let measures: RemoteMeasures;
  let map: Container;
  let rules: MeasureRules;
  let tokens: Record<string, AuraToken>;
  let asked: string[];
  let view: ReturnType<typeof playback>;
  let effects: AreaEffects;
  const texts = (container: Container): string[] => container.children.flatMap((child) => {
    if (!child.visible) return [];
    const text = child.children.find((part): part is Text => part instanceof Text);
    return text ? [text.text] : texts(child);
  });
  const labels = (): string[] => texts(measures.container);
  const reach = (): { left: number; right: number } => {
    const bounds = map.children[0]?.getLocalBounds();
    return { left: Math.round(bounds?.minX ?? 0), right: Math.round(bounds?.maxX ?? 0) };
  };
  const make = (ports: { effects?: boolean; tokens?: boolean } = {}): void => {
    measures = new RemoteMeasures({
      zoom: () => 1, rules: () => rules, interval: 100,
      ...(ports.effects !== false && { effects }),
      ...(ports.tokens !== false && { token: (id: string) => (asked.push(id), tokens[id] ?? null) }),
    });
    measures.layBodies((layer) => map.addChild(layer));
  };

  beforeEach(() => {
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
    rules = { grid: GRID, measurement: FEET };
    tokens = { [HERO]: { x: 105, y: 105, size: 1 } };
    asked = [];
    map = new Container();
    view = playback();
    effects = new AreaEffects(view.playback);
    make();
  });

  afterEach(() => {
    measures.destroy();
    effects.destroy();
    meshes.clear();
    vi.restoreAllMocks();
  });

  it('draws each measurement in its own colour, and one that names none in its sender\'s', () => {
    const fills = vi.spyOn(Graphics.prototype, 'fill');
    /** The colours bodies were filled in since the last look. */
    const filled = (): Set<unknown> => {
      const colours = fills.mock.calls.flatMap(([style]) => (typeof style === 'object' && style !== null && 'color' in style && 'alpha' in style ? [style.color] : []));
      fills.mockClear();
      return new Set(colours);
    };
    measures.update([told([{ ...circle, color: '#ec7500' }, { shape: 'square', pts: [0, 0, 70, 0] }], { shape: 'cone', pts: [0, 0, 0, 70], color: '#ffffff' })], 0);
    expect(filled()).toEqual(new Set([0xec7500, 0x8a5cf5, 0xffffff]));
    // Another colour of its own draws that one again, and no other.
    measures.update([told([{ ...circle, color: '#086ddd' }, { shape: 'square', pts: [0, 0, 70, 0] }], { shape: 'cone', pts: [0, 0, 0, 70], color: '#ffffff' })], 10);
    expect(filled()).toEqual(new Set([0x086ddd]));
  });

  it('plays an area\'s look on the host\'s effects, in the area\'s colour, each told from the sender\'s others', () => {
    measures.update([told([{ ...circle, effect: 'fire', color: '#ec7500' }, { shape: 'square', pts: [0, 0, 140, 0], effect: 'frost' }, circle])], 0);
    expect(effectsOf()).toEqual([{ effect: 'fire', color: '#ec7500', seed: 'gm:0' }, { effect: 'frost', color: '#8a5cf5', seed: 'gm:1' }]);
    expect(view.listening()).toBe(true);
    // Its body is still there: the look stands in the wash's place, under the cells and the outline.
    expect(reach()).toEqual({ left: 0, right: 490 });
  });

  it('takes a look off again, and asks nothing of the host while no measurement has one', () => {
    measures.update([told([{ ...circle, effect: 'fire' }, { shape: 'square', pts: [0, 0, 140, 0], effect: 'mist' }])], 0);
    measures.update([told([circle, { shape: 'square', pts: [0, 0, 140, 0], effect: 'mist' }])], 10);
    expect(effectsOf().map(({ effect }) => effect)).toEqual(['mist']);
    measures.update([told([circle])], 20);
    expect(meshes.size).toBe(0);
    expect(view.listening()).toBe(false);
    measures.update([told([{ ...circle, effect: 'radiance' }])], 30);
    expect(view.listening()).toBe(true);
    measures.update([], 40);
    expect(meshes.size).toBe(0);
    expect(view.listening()).toBe(false);
  });

  it('lets go of every look when it is destroyed, cleared, or its bodies are laid into another map', () => {
    measures.update([told([{ ...circle, effect: 'fire' }])], 0);
    measures.layBodies(null);
    expect(meshes.size).toBe(0);
    measures.layBodies((layer) => map.addChild(layer));
    measures.update([told([{ ...circle, effect: 'fire' }])], 10);
    expect(meshes.size).toBe(1);
    // The map is destroyed under it: what it drew there is let go of, and in no map nothing is played.
    map.destroy({ children: true });
    expect(() => measures.update([told([{ ...circle, effect: 'fire' }])], 20)).not.toThrow();
    expect(meshes.size).toBe(0);
    expect(view.listening()).toBe(false);
    map = new Container();
    measures.layBodies((layer) => map.addChild(layer));
    measures.update([told([{ ...circle, effect: 'fire' }])], 30);
    expect(meshes.size).toBe(1);
    measures.clear();
    expect(meshes.size).toBe(0);
    expect(view.listening()).toBe(false);
  });

  it('keeps the plain body where the host plays no effects, and gives a ruler or a measurement being drawn none', () => {
    measures.destroy();
    make({ effects: false });
    measures.update([told([{ ...circle, effect: 'fire' }])], 0);
    expect(meshes.size).toBe(0);
    expect(reach()).toEqual({ left: 210, right: 490 });
    measures.destroy();
    make();
    measures.update([told([], { ...circle, effect: 'fire' })], 10);
    expect(meshes.size).toBe(0);
  });

  it('lays an aura around its token where the host draws that token, and says how far it reaches', () => {
    // Its points are where it was last edited, far from its token.
    measures.update([told([{ shape: 'circle', pts: [2000, 2000, 2140, 2000], aura: { token: HERO, reach: 10 }, effect: 'shadow', color: '#7852ee' }])], 0);
    // Two cells around the token's cell.
    expect(reach()).toEqual({ left: -70, right: 280 });
    expect(labels()).toEqual(['10ft']);
    expect(effectsOf()).toEqual([{ effect: 'shadow', color: '#7852ee', seed: 'gm:0' }]);
  });

  it('follows the token when the host says tokens moved, drawn again only on other cells', () => {
    measures.update([told([{ ...circle, aura: { token: HERO, reach: 10 } }])], 0);
    const cleared = vi.spyOn(Graphics.prototype, 'clear');
    // Within its cell: the same aura.
    tokens[HERO] = { x: 120, y: 110, size: 1 };
    measures.tokensMoved();
    expect(cleared).not.toHaveBeenCalled();
    tokens[HERO] = { x: 385, y: 105, size: 1 };
    measures.tokensMoved();
    expect(reach()).toEqual({ left: 210, right: 560 });
    // A larger token has a larger aura.
    tokens[HERO] = { x: 420, y: 140, size: 2 };
    measures.tokensMoved();
    expect(reach()).toEqual({ left: 210, right: 630 });
  });

  it('draws no aura while the host draws no such token, and draws it once the token is there', () => {
    tokens = {};
    measures.update([told([{ ...circle, aura: { token: HERO, reach: 10 } }, { shape: 'square', pts: [0, 0, 70, 0] }])], 0);
    expect(labels()).toEqual(['5 × 5ft']);
    expect(reach()).toEqual({ left: 0, right: 70 });
    tokens[HERO] = { x: 385, y: 105, size: 1 };
    measures.tokensMoved();
    expect(labels().sort()).toEqual(['10ft', '5 × 5ft']);
    expect(reach()).toEqual({ left: 0, right: 560 });
    delete tokens[HERO];
    measures.tokensMoved();
    expect(labels()).toEqual(['5 × 5ft']);
    expect(reach()).toEqual({ left: 0, right: 70 });
    // A measurement told in its place is drawn whole, its size with it.
    measures.update([told([circle, { shape: 'square', pts: [0, 0, 70, 0] }])], 10);
    expect(labels().sort()).toEqual(['10ft', '5 × 5ft']);
  });

  it('lays an aura anew by other rules, and never in the older words\' place', () => {
    measures.update([told([{ ...circle, aura: { token: HERO, reach: 10 } }])], 0);
    rules = { grid: GRID, measurement: { ...FEET, unitDistance: 10, ruleDistance: 10 } };
    measures.rescale();
    // Ten feet is one cell now.
    expect(reach()).toEqual({ left: 0, right: 210 });
    measures.destroy();
    make({ tokens: false });
    measures.update([told([{ ...circle, aura: { token: HERO, reach: 10 } }])], 10);
    expect(labels()).toEqual([]);
    expect(reach()).toEqual({ left: 0, right: 0 });
  });

  it('asks the host for no token while no aura is told', () => {
    measures.update([told([{ ...circle, effect: 'fire' }, { shape: 'ruler', pts: [0, 0, 70, 0] }], circle)], 0);
    measures.tokensMoved();
    measures.tick(10);
    expect(asked).toEqual([]);
  });
});
