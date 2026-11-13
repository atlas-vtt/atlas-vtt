// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { drawScene, type DrawScene } from '../helpers/drawScene';

let scene: DrawScene | null = null;

const pointerEvent = (x: number, y: number): FederatedPointerEvent =>
  ({ button: 0, global: { x, y }, stopPropagation: () => {} }) as unknown as FederatedPointerEvent;

function press(s: DrawScene, id: string, x: number, y: number): void {
  s.node('text', id)?.emit('pointerdown', pointerEvent(x, y));
}

const addText = (s: DrawScene): string => s.store.getState().addText({ x: 100, y: 100, text: 'Here', fontSize: 24, fontFamily: 'Arial', color: '#ffffff' });

describe('dragging a text', () => {
  afterEach(() => {
    scene?.destroy();
    scene = null;
  });

  it('keeps a moved text where it is when it is clicked again', () => {
    const s = scene = drawScene();
    const id = addText(s);

    press(s, id, 100, 100);
    s.viewport.emit('pointerup', pointerEvent(300, 250));
    expect(s.store.getState().objects.texts[id]).toMatchObject({ x: 300, y: 250 });

    press(s, id, 300, 250);
    s.viewport.emit('pointerup', pointerEvent(300, 250));

    expect(s.store.getState().objects.texts[id]).toMatchObject({ x: 300, y: 250 });
  });

  it('moves the text\'s view with the pointer, and selects it', () => {
    const s = scene = drawScene();
    const id = addText(s);

    press(s, id, 100, 100);
    s.viewport.emit('pointermove', pointerEvent(160, 130));

    const view = s.node('text', id);
    expect([view?.x, view?.y]).toEqual([160, 130]);
    expect(s.store.getState().selectedIds).toEqual([id]);
    // The store hears of the move with the release.
    expect(s.store.getState().objects.texts[id]).toMatchObject({ x: 100, y: 100 });
    s.viewport.emit('pointerup', pointerEvent(160, 130));
  });

  it('takes no press in a view that is the players\' own', () => {
    const s = scene = drawScene({ playerView: true });
    const id = addText(s);

    press(s, id, 100, 100);
    s.viewport.emit('pointerup', pointerEvent(300, 250));

    expect(s.store.getState().objects.texts[id]).toMatchObject({ x: 100, y: 100 });
    expect(s.store.getState().selectedIds).toEqual([]);
  });
});
