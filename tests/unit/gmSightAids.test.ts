import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Container, EventSystem, Graphics, Text } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { GmSightAids, SIGHT_AIDS_Z_INDEX } from '../../src/app/pixi/lighting/GmSightAids';
import { restingTokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenInput } from '../../src/app/types/viewState';
import type { TokenEntity } from '../../src/app/types';
import type { Perception } from '../../src/app/vision/perception';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

interface Setup {
  aids: GmSightAids;
  store: ViewAtlasStore;
  viewport: Viewport;
  /** How the players perceive each token; unnamed tokens are seen. */
  perceived: Record<string, Perception>;
  /** How often the perception was asked for: once per update. */
  asked: () => number;
  add: (x: number, vision?: TokenEntity['vision']) => string;
}

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.className = '';
});

function setup(measure: () => MeasurementSettings = measurement, frames: () => Window = () => window): Setup {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `gm-sight-aids-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/aids.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const perceived: Record<string, Perception> = {};
  const perception = vi.fn(() => (id: string): Perception => perceived[id] ?? 'seen');
  const aids = new GmSightAids({
    viewport,
    store,
    measurement: measure,
    bounds: () => ({ width: 4000, height: 4000 }),
    rules: () => GENERIC_SIGHT_RULES,
    perception: () => (store.getState().lighting.enabled ? perception() : undefined),
    frames,
  });
  cleanup = () => {
    aids.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const add = (x: number, vision?: TokenEntity['vision']): string =>
    store.getState().addToken({ kind: 'character', name: 'Mirabel', imagePath: 't.png', x, y: 500, size: 1, ...(vision && { vision }) } as TokenInput);
  return { aids, store, viewport, perceived, asked: () => perception.mock.calls.length, add };
}

/** The texts of the ring labels, in the order they are drawn. */
const labels = (aids: GmSightAids): string[] => aids.rings.labels();

describe('the ranges of a selected vision token', () => {
  const SENSES = { enabled: true, range: 60, senses: [{ id: 'darkvision', range: 30 }, { id: 'tremorsense', range: 15 }] };

  it('are a labelled ring for its sight and each sense with a distance, and the names of those without one', () => {
    const { aids, store, add } = setup();
    const id = add(500, SENSES);
    aids.update();
    expect(aids.rings.view.visible).toBe(false);
    store.getState().setSelection([id]);
    aids.update();
    expect(aids.rings.view.visible).toBe(true);
    expect(labels(aids)).toEqual(['Sight 60ft', 'Darkvision 30ft', 'Tremorsense 15ft']);
    expect(aids.rings.rings()[0]!.rings.map((ring) => [ring.radius, ring.style])).toEqual([[840, 'sight'], [420, 'sense'], [210, 'creatures']]);
    store.getState().setSelection([add(900, { enabled: true, senses: [{ id: 'low-light-vision' }, { id: 'darkvision', range: 30 }] })]);
    aids.update();
    // What has no limit has neither ring nor label: Edit Token says it.
    expect(labels(aids)).toEqual(['Darkvision 30ft']);
  });

  it('are drawn for vision tokens only, on a lit scene, and for a handful of tokens at most', () => {
    const { aids, store, add } = setup();
    const plain = add(100);
    const seeing = [200, 300, 400, 500, 600].map((x) => add(x, SENSES));
    store.getState().setSelection([plain]);
    aids.update();
    expect(labels(aids)).toEqual([]);
    store.getState().setSelection(seeing);
    aids.update();
    expect(aids.rings.view.visible).toBe(false);
    store.getState().setSelection(seeing.slice(0, 2));
    aids.update();
    expect(labels(aids)).toHaveLength(6);
    store.getState().setSceneLighting({ enabled: false });
    aids.update();
    expect(aids.rings.view.visible).toBe(false);
    expect(labels(aids)).toEqual([]);
  });

  it('keep their labels at one size on screen, and keep a label while its text stays', () => {
    const { aids, store, viewport, add } = setup();
    const id = add(500, SENSES);
    store.getState().setSelection([id]);
    aids.update();
    const before = aids.rings.view.children[1]!.children.slice();
    expect(before[0]!.scale.x).toBe(1);
    viewport.scale.set(4);
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    const after = aids.rings.view.children[1]!.children;
    expect(after).toEqual(before);
    expect(after[0]!.scale.x).toBe(0.25);
    // Another range is another label; the others stay.
    store.getState().updateToken(id, { vision: { ...SENSES, range: 40 } });
    aids.update();
    expect(labels(aids).sort()).toEqual(['Darkvision 30ft', 'Sight 40ft', 'Tremorsense 15ft']);
    expect(before[0]!.destroyed).toBe(true);
    expect(before[1]!.destroyed).toBe(false);
  });

  it('follow the theme', () => {
    const { aids, store, add } = setup();
    store.getState().setSelection([add(500, SENSES)]);
    aids.update();
    const light = aids.rings.view.children[1]!.children[0]!;
    document.body.classList.add('theme-dark');
    aids.update();
    expect(light.destroyed).toBe(true);
    const text = (aids.rings.view.children[1]!.children[0] as Container).children[1] as Text;
    expect(text.style.fill).toBe(0xffffff);
  });
});

/** The lines of the rings and cone edges. */
const lines = (aids: GmSightAids): Graphics => aids.rings.view.children[0] as Graphics;

describe('the ranges of a selected vision token in the edge cases', () => {
  it('draws the cone\'s edges out to the map\'s diagonal for a token that looks one way with unlimited sight', () => {
    const { aids, store, add } = setup();
    const id = add(500, { enabled: true, angle: 90 });
    store.getState().setSelection([id]);
    aids.update();
    expect(labels(aids)).toEqual([]);
    expect(aids.rings.rings()[0]).toMatchObject({ cone: { angle: Math.PI / 2 }, coneReach: Math.hypot(4000, 4000) });
    const stroked = lines(aids).context.instructions.filter((instruction) => instruction.action === 'stroke');
    // The dark rim and the line, each of the two edges.
    expect(stroked).toHaveLength(2);
    // With a sight range the edges end at its ring.
    store.getState().updateToken(id, { vision: { enabled: true, angle: 90, range: 60 } });
    aids.update();
    expect(aids.rings.rings()[0]!.coneReach).toBe(840);
  });

  it('words a distance that is not whole as it is set: 7.5 m is not 8 m', () => {
    const metres = (): MeasurementSettings => ({ mode: 'grid', unitType: 'meters', unitDistance: 1.5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
    const { aids, store, add } = setup(metres);
    store.getState().setSelection([add(500, { enabled: true, range: 18, senses: [{ id: 'tremorsense', range: 4.5 }, { id: 'darkvision', range: 7.5 }] })]);
    aids.update();
    expect(labels(aids)).toEqual(['Sight 18m', 'Darkvision 7.5m', 'Tremorsense 4.5m']);
  });

  it('keeps its dashes one length on screen at every zoom', () => {
    const { aids, store, viewport, add } = setup();
    store.getState().setSelection([add(2000, { enabled: true, senses: [{ id: 'tremorsense', range: 60 }] })]);
    aids.update();
    const dashOnScreen = (zoom: number): number => {
      viewport.scale.set(zoom);
      // The camera looks at the ring's right end, where the first dashes are.
      viewport.position.set(400 - 2840 * zoom, 300 - 500 * zoom);
      viewport.emit('zoomed', { viewport, type: 'wheel' });
      const arcs = lines(aids).context.instructions
        .flatMap((instruction) => ((instruction.data as { path?: { instructions: Array<{ action: string; data: number[] }> } }).path?.instructions ?? []))
        .filter((step) => step.action === 'arc');
      const [, , radius, from, to] = arcs[0]!.data as [number, number, number, number, number];
      expect(arcs.length).toBeLessThan(2000);
      return (to - from) * radius * zoom;
    };
    // Tremorsense is dotted: dashes of 2 px.
    for (const zoom of [0.25, 1, 4, 8]) expect(dashOnScreen(zoom)).toBeCloseTo(2, 0);
  });

  it('are not drawn while the scene has token vision off: no token\'s sight counts there', () => {
    const { aids, store, add } = setup();
    const id = add(500, { enabled: true, range: 60 });
    store.getState().setSelection([id]);
    aids.update();
    expect(labels(aids)).toEqual(['Sight 60ft']);
    store.getState().setSceneLighting({ tokenVision: false });
    aids.update();
    expect(labels(aids)).toEqual([]);
    expect(aids.rings.view.visible).toBe(false);
  });

  it('are drawn anew only when what they show changes: the selected token, the zoom, the theme', () => {
    const { aids, store, viewport, add } = setup();
    const seeing = add(500, { enabled: true, range: 60, senses: [{ id: 'darkvision', range: 30 }] });
    const other = add(2000);
    store.getState().setSelection([seeing]);
    aids.update();
    const clear = vi.spyOn(lines(aids), 'clear');
    store.getState().updateToken(other, { name: 'Renamed', x: 2100 });
    aids.update();
    aids.update();
    expect(clear).not.toHaveBeenCalled();
    store.getState().updateToken(seeing, { x: 520 });
    aids.update();
    expect(clear).toHaveBeenCalledTimes(1);
    store.getState().updateToken(seeing, { vision: { enabled: true, range: 40 } });
    aids.update();
    expect(clear).toHaveBeenCalledTimes(2);
    viewport.scale.set(2);
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    expect(clear).toHaveBeenCalledTimes(3);
    // The camera moves without a zoom: nothing of a ring this small is left out, so nothing is drawn anew.
    viewport.position.set(-40, -40);
    viewport.emit('moved', { viewport, type: 'drag' });
    expect(clear).toHaveBeenCalledTimes(3);
    document.body.classList.add('theme-dark');
    aids.update();
    expect(clear).toHaveBeenCalledTimes(4);
    // Nothing selected: nothing to clear, again and again.
    store.getState().setSelection([]);
    aids.update();
    expect(clear).toHaveBeenCalledTimes(5);
    store.getState().updateToken(other, { x: 2200 });
    aids.update();
    expect(clear).toHaveBeenCalledTimes(5);
  });
});

describe('the marks on tokens the players do not see', () => {
  it('sit on the edge of every token the players do not see, by kind, at the size of token UI', () => {
    const { aids, perceived, add } = setup();
    const unseen = add(100);
    const sensed = add(300);
    add(500);
    perceived[unseen] = 'unseen';
    perceived[sensed] = 'sensed';
    aids.update();
    expect(aids.marks.shown()).toEqual([[unseen, 'unseen'], [sensed, 'sensed']]);
    const [first, second] = aids.marks.view.children as Container[];
    // A medium token on a 70 px grid is 62 across: the mark sits on its rim, up and to the right.
    expect(first!.x).toBeCloseTo(100 + 31 * Math.SQRT1_2);
    expect(first!.y).toBeCloseTo(500 - 31 * Math.SQRT1_2);
    expect(first!.scale.x).toBe(restingTokenUIScale(70));
    expect(second!.x).toBeCloseTo(300 + 31 * Math.SQRT1_2);
    // Over the lighting, under the token UI, and never in the pointer's way.
    expect(aids.view.zIndex).toBe(SIGHT_AIDS_Z_INDEX);
    expect(SIGHT_AIDS_Z_INDEX).toBeGreaterThan(90);
    expect(SIGHT_AIDS_Z_INDEX).toBeLessThan(100);
    expect(aids.view.eventMode).toBe('none');
  });

  it('keep a mark while its token stays unseen, draw it anew when it is sensed instead, and take it away when it is seen', () => {
    const { aids, store, perceived, add } = setup();
    const id = add(100);
    perceived[id] = 'unseen';
    aids.update();
    const mark = aids.marks.view.children[0]!;
    store.getState().updateToken(id, { x: 140 });
    aids.update();
    expect(aids.marks.view.children[0]).toBe(mark);
    expect(mark.x).toBeCloseTo(140 + 31 * Math.SQRT1_2);
    perceived[id] = 'sensed';
    aids.update();
    expect(mark.destroyed).toBe(true);
    expect(aids.marks.shown()).toEqual([[id, 'sensed']]);
    perceived[id] = 'seen';
    aids.update();
    expect(aids.marks.shown()).toEqual([]);
    expect(aids.marks.view.visible).toBe(false);
  });

  it('are none on a hidden token, on an unlit scene and while a map loads', () => {
    const { aids, store, perceived, add } = setup();
    const id = add(100);
    const hidden = add(300);
    perceived[id] = 'unseen';
    perceived[hidden] = 'unseen';
    store.getState().updateToken(hidden, { isHidden: true });
    aids.update();
    expect(aids.marks.shown()).toEqual([[id, 'unseen']]);
    store.setState({ isMapLoading: true });
    aids.update();
    expect(aids.marks.shown()).toEqual([]);
    store.setState({ isMapLoading: false });
    store.getState().setSceneLighting({ enabled: false });
    aids.update();
    expect(aids.marks.shown()).toEqual([]);
  });

  it('are drawn in the theme\'s badge colours, anew when the theme changes', async () => {
    const { aids, perceived, add } = setup();
    perceived[add(100)] = 'unseen';
    aids.update();
    const light = aids.marks.view.children[0]!;
    document.body.classList.add('theme-dark');
    await vi.waitFor(() => expect(light.destroyed).toBe(true));
    expect(aids.marks.shown()).toHaveLength(1);
  });
});

describe('GmSightAids', () => {
  it('works the marks out once per frame, however many changes arrive, and again when the sight changed', async () => {
    const { aids, store, perceived, asked, add } = setup();
    const id = add(100);
    await nextFrame();
    const before = asked();
    perceived[id] = 'unseen';
    for (let x = 101; x < 110; x++) store.getState().updateToken(id, { x });
    aids.schedule();
    expect(aids.marks.shown()).toEqual([]);
    await nextFrame();
    expect(asked()).toBe(before + 1);
    expect(aids.marks.shown()).toEqual([[id, 'unseen']]);
    // No change, no work.
    await nextFrame();
    expect(asked()).toBe(before + 1);
    perceived[id] = 'seen';
    aids.schedule();
    await nextFrame();
    expect(aids.marks.shown()).toEqual([]);
  });

  it('cancels a waiting update in the window it asked, also once the canvas is in another (a popout)', () => {
    const fake = (): { window: Window; pending: Map<number, FrameRequestCallback>; cancelled: number[] } => {
      const pending = new Map<number, FrameRequestCallback>();
      const cancelled: number[] = [];
      let next = 0;
      const frames = {
        requestAnimationFrame: (callback: FrameRequestCallback): number => (pending.set(++next, callback), next),
        cancelAnimationFrame: (id: number): void => { cancelled.push(id); pending.delete(id); },
      } as unknown as Window;
      return { window: frames, pending, cancelled };
    };
    const first = fake();
    const second = fake();
    let current = first;
    const { aids } = setup(measurement, () => current.window);
    expect(first.pending.size).toBe(1);
    const update = vi.spyOn(aids, 'update');
    current = second;
    cleanup!();
    cleanup = null;
    expect(first.cancelled).toHaveLength(1);
    expect(first.pending.size).toBe(0);
    expect(second.cancelled).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it('shows nothing while the canvas shows the players\' view, and all of it again after', () => {
    const { aids, store, perceived, add } = setup();
    const unseen = add(100);
    const seeing = add(500, { enabled: true, range: 60 });
    perceived[unseen] = 'unseen';
    store.getState().setSelection([seeing]);
    aids.update();
    expect([aids.marks.view.visible, aids.rings.view.visible]).toEqual([true, true]);
    aids.setSuppressed(true);
    expect(aids.view.visible).toBe(false);
    expect([aids.marks.view.visible, aids.rings.view.visible]).toEqual([false, false]);
    expect(aids.marks.shown()).toEqual([]);
    // Session view hides the layer through the players' list; the GM's view has it back.
    aids.view.visible = false;
    aids.setSuppressed(false);
    expect(aids.view.visible).toBe(true);
    expect([aids.marks.view.visible, aids.rings.view.visible]).toEqual([true, true]);
  });
});
