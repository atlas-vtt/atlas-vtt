// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnnotationSelectionHost } from '../../src/app/pixi/SelectionManager';
import type { DrawingStroke, TextElement } from '../../src/app/types';
import { penStroke, selectionHarness, tokenSprite } from '../helpers/selectionManagerHarness';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: () => void = () => undefined;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
});
afterEach(() => restoreGraphics());

const label = (id: string, x: number, y: number, more: Partial<TextElement> = {}): TextElement =>
  ({ id, kind: 'text', x, y, text: 'Gate', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...more });
const stroke = (id: string, y: number, more: Partial<DrawingStroke> = {}): DrawingStroke => ({ ...penStroke(id, [{ x: 100, y }, { x: 300, y }]), ...more });
const host = (more: Partial<AnnotationSelectionHost> = {}): AnnotationSelectionHost => ({ framedIds: () => new Set(), turnAlong: () => null, ...more });

/** A token and, below it, a drawing above the tokens, one on the map, a locked one, and a text. */
const scene = {
  tokens: { goblin: tokenSprite(200, 50, true) },
  drawings: { above: stroke('above', 150), floor: stroke('floor', 200, { layer: 'map' }), kept: stroke('kept', 250, { locked: true }) },
  texts: { sign: label('sign', 200, 320) },
};

describe('a marquee and the drawings and texts', () => {
  it('draws none in the Draw tool: a press there draws', () => {
    const { store, drag } = selectionHarness({ ...scene, tool: 'draw' });
    drag([0, 0], [400, 400]);
    expect(store.getState().selectedIds).toEqual([]);
  });

  it('takes tokens alone with the select and move tools: drawings and texts are selected by a press', () => {
    for (const tool of ['select', 'move'] as const) {
      const { store, drag } = selectionHarness({ ...scene, tool });
      drag([0, 0], [400, 400]);
      expect(store.getState().selectedIds).toEqual(['goblin']);
    }
  });
});

describe('the selection\'s highlights and the drawings and texts', () => {
  it('mark a selected text and drawing beside a token, and leave to their own handles what those frame', () => {
    const framed = new Set<string>();
    const { store, highlighted } = selectionHarness({ ...scene, annotations: host({ framedIds: () => framed }) });
    store.setState({ selectedIds: ['goblin', 'sign', 'above'] });
    expect(highlighted()).toBe(3);
    // Without a token the two are framed by their handles: no second mark.
    framed.add('sign').add('above');
    store.setState({ selectedIds: ['sign', 'above'] });
    expect(highlighted()).toBe(0);
  });
});
