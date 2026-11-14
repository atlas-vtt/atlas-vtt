// @vitest-environment jsdom
import { EventBoundary, FederatedPointerEvent, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationList } from '../../../src/app/annotations/annotationList';
import { placedBy, type Transform } from '../../../src/app/annotations/annotationTransform';
import { DEFAULT_DRAW_TOOL, type AnnotationPlace } from '../../../src/app/annotations/annotationTypes';
import { rectanglePoints } from '../../../src/app/annotations/shapeOutlines';
import { AnnotationHandles } from '../../../src/app/pixi/annotations/AnnotationHandles';
import { AnnotationInteraction } from '../../../src/app/pixi/annotations/AnnotationInteraction';
import { AnnotationLayer } from '../../../src/app/pixi/annotations/AnnotationLayer';
import type { SelectingState } from '../../../src/app/pixi/annotations/drawToolState';
import type { DrawingStroke } from '../../../src/app/types';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

const P = (x: number, y: number): { x: number; y: number } => ({ x, y });
const drawing = (id: string, points: { x: number; y: number }[], more: Partial<DrawingStroke> = {}): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'rectangle', points, color: '#ffffff', width: 4, opacity: 1, ...more });

interface Placed {
  readonly places: Readonly<Record<string, AnnotationPlace>>;
  readonly by: Transform | undefined;
}

/**
 * Selecting and reshaping with no view's store behind them: Atlas's frame, handles and gestures
 * over a plain object that holds some drawings, what is selected of them and the tool's choices,
 * and that hears where a gesture left them. What a players' page builds its Draw tool from: it
 * hands in only the player's own drawings and sends each write to the GM.
 */
function standalone(drawings: Record<string, DrawingStroke>): {
  state: SelectingState;
  placed: Placed[];
  press(x: number, y: number): boolean;
  pointer(type: 'pointermove' | 'pointerup', x: number, y: number): void;
  destroy(): void;
} {
  const restoreGraphics = stubJsdomGraphics();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: createEl('canvas') } as unknown as EventSystem });
  const layer = new AnnotationLayer(viewport, { zoom: () => 1, sharpness: { track: () => undefined, forget: () => undefined } });
  layer.setList(annotationList({ drawings, texts: {} }));
  const placed: Placed[] = [];
  const state: SelectingState = {
    activeTool: 'move', drawTool: DEFAULT_DRAW_TOOL, selectedIds: [],
    objects: { drawings, texts: {}, tokens: {} },
    setSelection: (ids) => {
      state.selectedIds = ids;
      interaction.follow();
    },
    placeAnnotations: (places, by) => void placed.push({ places, by }),
  };
  const handles = new AnnotationHandles({ zoom: () => 1, accent: () => 0x8a5cf5, changed: () => undefined });
  viewport.addChild(handles.view);
  const interaction: AnnotationInteraction = new AnnotationInteraction({
    viewport, store: { getState: () => state }, layer: layer.previews, handles, measure: layer.measure,
    gmView: () => true, touched: () => undefined, snap: (world) => world, editText: () => undefined, typing: () => false,
    wordsBox: () => ({ width: 0, height: 0 }), breaksAt: () => [], copyMoved: () => undefined, dragTokens: () => undefined,
  });
  const boundary = new EventBoundary(viewport);
  const eventOf = (x: number, y: number): FederatedPointerEvent => {
    const event = new FederatedPointerEvent(boundary);
    event.button = 0;
    event.pointerId = 1;
    event.global.set(x, y);
    return event;
  };
  return {
    state, placed,
    press: (x, y) => {
      const event = eventOf(x, y);
      return interaction.pointer.gripDown(x, y, event) || interaction.pointer.pointerDown(x, y, event);
    },
    pointer: (type, x, y) => void viewport.emit(type, eventOf(x, y)),
    destroy: () => {
      interaction.destroy();
      handles.destroy();
      viewport.destroy({ children: true });
      restoreGraphics();
    },
  };
}

let current: ReturnType<typeof standalone> | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

describe('selecting and reshaping over a plain object', () => {
  it('selects the drawing a press lands on and nothing where none is handed in', () => {
    const s = current = standalone({ room: drawing('room', rectanglePoints(P(100, 100), P(300, 250))) });
    expect(s.press(500, 500)).toBe(false);
    expect(s.state.selectedIds).toEqual([]);
    expect(s.press(200, 100)).toBe(true);
    s.pointer('pointerup', 200, 100);
    expect(s.state.selectedIds).toEqual(['room']);
    expect(s.placed).toEqual([]);
  });

  it('tells where a drag left what is selected, with the one map of the plane that moved it', () => {
    const points = rectanglePoints(P(100, 100), P(300, 250));
    const s = current = standalone({ room: drawing('room', points), other: drawing('other', rectanglePoints(P(500, 100), P(600, 200))) });
    s.press(200, 100);
    s.pointer('pointermove', 230, 120);
    s.pointer('pointermove', 270, 170);
    s.pointer('pointerup', 270, 170);
    expect(s.placed).toHaveLength(1);
    const [{ places, by }] = s.placed as [Placed];
    expect(Object.keys(places)).toEqual(['room']);
    expect(places.room?.points).toEqual(points.map(({ x, y }) => P(x + 70, y + 70)));
    // The map says the same as the places: whoever is sent it alone (a GM told of a player's drag) writes what the gesture left.
    expect(by).toMatchObject({ a: 1, b: 0, c: 0, d: 1, tx: 70, ty: 70, turn: 0 });
    const [room] = annotationList({ drawings: s.state.objects.drawings, texts: {} }).filter(({ id }) => id === 'room');
    expect(placedBy(room!, by!).points).toEqual(places.room?.points);
    // The object itself was not written: what holds it decides what becomes of the gesture.
    expect(s.state.objects.drawings.room?.points).toEqual(points);
  });
});
