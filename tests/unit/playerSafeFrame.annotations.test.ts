// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { DrawingStroke, TextElement } from '../../src/app/types';
import { drawScene, type DrawScene } from '../helpers/drawScene';
import { FRAME, fakePlayerFrames, fakeViewport } from '../mocks/playerFrameSource';

const SETTINGS = { showTokenNameplates: true } as never;

let scene: DrawScene | null = null;
afterEach(() => {
  scene?.destroy();
  scene = null;
});

const pen = (id: string, more: Partial<DrawingStroke> = {}): DrawingStroke =>
  ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#ffffff', width: 4, opacity: 1, ...more });
const label = (id: string, more: Partial<TextElement> = {}): TextElement =>
  ({ id, kind: 'text', x: 50, y: 50, text: 'Trap', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...more });

/** The orchestrator with only what a players' frame and a picture of the scene read, over a real view of drawings. */
function harness(): { renderer: PixiRendererOrchestrator; s: DrawScene; shown(): Record<string, boolean> } {
  const s = scene = drawScene();
  s.store.setState({
    objects: {
      ...s.store.getState().objects,
      drawings: {
        shown: pen('shown'),
        secret: pen('secret', { hidden: true }),
        floor: pen('floor', { layer: 'map' }),
        trap: pen('trap', { layer: 'map', hidden: true }),
        // Far from what the camera and its margin show.
        far: pen('far', { points: [{ x: 5000, y: 5000 }, { x: 5100, y: 5000 }] }),
      },
      texts: { note: label('note', { hidden: true }), sign: label('sign', { x: 300 }) },
    },
  });
  const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
    pixiAppManager: { getApp: () => ({ renderer: { render: vi.fn() }, stage: {} }), getViewport: fakeViewport },
    playerFrames: fakePlayerFrames(),
    annotations: s.renderer,
    dmScreenOverlays: new Set(),
  });
  /** Whether a render now would draw each annotation: its node is there and shown, and so is every layer above it. */
  const shown = (): Record<string, boolean> => Object.fromEntries(
    ([['drawing', 'shown'], ['drawing', 'secret'], ['drawing', 'floor'], ['drawing', 'trap'], ['drawing', 'far'], ['text', 'note'], ['text', 'sign']] as const).map(([kind, id]) => {
      const node = s.node(kind, id);
      return [id, !!node && node.visible && node.parent?.visible === true];
    }),
  );
  return { renderer, s, shown };
}

describe('a players\' frame and the drawings', () => {
  it('leaves out what only the GM sees, on the map and above, and the tool\'s own marks, for the one render', () => {
    const { renderer, s, shown } = harness();
    expect(shown()).toMatchObject({ shown: true, secret: true, floor: true, trap: true, note: true, sign: true });
    const chrome = s.viewport.children.find((child) => child.label === 'annotation-chrome');
    const during: Record<string, boolean>[] = [];
    let chromeDuring: boolean | undefined;
    renderer.withPlayerSafeFrame(() => {
      during.push(shown());
      chromeDuring = chrome?.visible;
    }, SETTINGS, FRAME);
    expect(during).toEqual([expect.objectContaining({ shown: true, floor: true, sign: true, secret: false, trap: false, note: false })]);
    expect(chromeDuring).toBe(false);
    // The GM's canvas has all of it again.
    expect(shown()).toMatchObject({ shown: true, secret: true, floor: true, trap: true, note: true, sign: true });
    expect(chrome?.visible).toBe(true);
  });

  it('draws what a frame shows that the camera does not, whole, for its render', () => {
    const { renderer, shown } = harness();
    // The camera shows the map's corner (800 × 600 and a margin): the far drawing was never drawn.
    expect(shown().far).toBe(false);
    let during: boolean | undefined;
    renderer.withPlayerSafeFrame(() => { during = shown().far; }, SETTINGS, { ...FRAME, centerX: 5050, centerY: 5000 });
    expect(during).toBe(true);
    expect(shown().far).toBe(false);
    // A frame within what the camera shows changes nothing.
    renderer.withPlayerSafeFrame(() => { during = shown().far; }, SETTINGS, { ...FRAME, width: 400, height: 300, centerX: 400, centerY: 300 });
    expect(during).toBe(false);
  });
});

describe('a picture of the scene and the drawings', () => {
  it('is the GM\'s picture without what the GM keeps from the players, and with every drawing of the scene', () => {
    const { renderer, shown } = harness();
    expect(shown().far).toBe(false);
    const during = renderer.captureSceneFrame({} as never, shown);
    expect(during).toMatchObject({ shown: true, floor: true, sign: true, far: true, secret: false, trap: false, note: false });
    expect(shown()).toMatchObject({ secret: true, trap: true, note: true });
  });
});

describe('the canvas in the players\' picture and the drawings', () => {
  it('hides what only the GM sees while the canvas shows the players\' picture: session view, a peek, the palette\'s player mode', () => {
    const { s, shown } = harness();
    s.store.getState().setGMView(false);
    expect(shown()).toMatchObject({ shown: true, floor: true, sign: true, secret: false, trap: false, note: false });
    s.store.getState().setGMView(true);
    expect(shown()).toMatchObject({ secret: true, trap: true, note: true });
    // A peek is the lighting's to say: whoever knows of it tells, and the drawings follow.
    s.players.shown = true;
    s.renderer.refreshVisibility();
    expect(shown()).toMatchObject({ shown: true, secret: false, trap: false, note: false });
    s.players.shown = false;
    s.renderer.refreshVisibility();
    expect(shown()).toMatchObject({ secret: true, trap: true, note: true });
  });

  it('keeps a selected text\'s handles out of a frame for others, and lets what the canvas hides leave the selection', () => {
    const { renderer, s } = harness();
    const handles = (): boolean[] => ['textRotationUI', 'textResizeUI'].map((name) => s.viewport.children.find((child) => child.label === name)?.visible === true);
    s.store.getState().setSelection(['note']);
    expect(handles()).toEqual([true, true]);
    let during: boolean[] = [];
    renderer.withPlayerSafeFrame(() => { during = handles(); }, SETTINGS, FRAME);
    expect(during).toEqual([false, false]);
    expect(renderer.captureSceneFrame({} as never, handles)).toEqual([false, false]);
    expect(handles()).toEqual([true, true]);
    // In session view the hidden text is not there to be selected: its handles go with it.
    s.store.getState().setGMView(false);
    expect(s.store.getState().selectedIds).toEqual([]);
    expect(handles()).toEqual([false, false]);
    // What players see stays selected.
    s.store.getState().setGMView(true);
    s.store.getState().setSelection(['sign', 'shown', 'secret']);
    s.store.getState().setGMView(false);
    expect(s.store.getState().selectedIds).toEqual(['sign', 'shown']);
  });

  it('follows the tokens\' word of what the canvas shows, once it is wired to them', () => {
    const { renderer, s, shown } = harness();
    const listeners: Array<() => void> = [];
    let peeking = false;
    Object.assign(renderer, {
      tokenRenderer: {
        onPlayersViewChange: (listener: () => void) => { listeners.push(listener); return () => undefined; },
        playersSeeOnCanvas: () => (peeking ? () => true : null),
      },
    });
    s.players.shown = null;
    (renderer as unknown as { wireAnnotations(): void }).wireAnnotations();
    expect(listeners).toHaveLength(1);
    expect(shown().secret).toBe(true);
    // The scene's renderer asks the tokens in the app; here the scene's own answer stands in for theirs.
    peeking = true;
    s.players.shown = true;
    listeners[0]!();
    expect(shown()).toMatchObject({ shown: true, secret: false, trap: false, note: false });
  });

  it('takes no press on a drawing the canvas hides', () => {
    const { s } = harness();
    s.store.setState({ objects: { ...s.store.getState().objects, drawings: { secret: pen('secret', { hidden: true }) } } });
    expect(s.renderer.drawings.hitTest(50, 0)).toBe('secret');
    s.store.getState().setGMView(false);
    expect(s.renderer.drawings.hitTest(50, 0)).toBeNull();
  });

  it('takes no press of the select tool on a drawing that lies on the map, or is locked', () => {
    const { s } = harness();
    s.store.setState({ objects: { ...s.store.getState().objects, drawings: { floor: pen('floor', { layer: 'map' }), kept: pen('kept', { locked: true, points: [{ x: 0, y: 40 }, { x: 100, y: 40 }] }) } } });
    expect(s.renderer.drawings.hitTest(50, 0)).toBeNull();
    expect(s.renderer.drawings.hitTest(50, 40)).toBeNull();
  });
});
