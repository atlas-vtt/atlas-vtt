// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationHandles } from '../../../src/app/pixi/annotations/AnnotationHandles';
import { drawScene, type DrawScene } from '../../helpers/drawScene';

/** The frame and handles the map shows now. */
const shown = (s: DrawScene): unknown => (s.renderer as unknown as { handles: AnnotationHandles }).handles.handles;

describe('the frame of a selected drawing follows the selection', () => {
  let s: DrawScene;
  afterEach(() => s.destroy());

  it('goes when the selection goes, also where something else read the selection first', () => {
    // The selection's own marks ask which drawings the frame holds on every change, before the drawings hear of it.
    s = drawScene({ hearsFirst: (store) => store.subscribe(() => void s?.renderer.selecting.framedIds) });
    s.store.getState().setActiveTool('move');
    const id = s.store.getState().addDrawing({ type: 'pen', points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], color: '#ffffff', width: 6, opacity: 1 });
    s.store.getState().setSelection([id]);
    expect(shown(s)).not.toBeNull();
    s.store.getState().clearSelection();
    expect(shown(s)).toBeNull();
    s.store.getState().setSelection([id]);
    expect(shown(s)).not.toBeNull();
  });
});
