// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPreviewWindowDrag, type PreviewWindowReach } from '../../src/app/services/previewWindowControls';
import { installPointerEvents, pointerEvent, type PointerInit } from '../helpers/pointerEvents';

/** A map view at 300, 40 of 1000 × 800 and a window whose controls sit at its top right. */
const FRAME = { left: 300, top: 40, right: 1300, bottom: 840 };
const REACH = { left: 900, top: 100, right: 1000, bottom: 140 };
const reach: PreviewWindowReach = { reach: () => REACH, frame: () => FRAME };

function previewWindow(): { element: HTMLElement; link: HTMLElement } {
  const element = document.body.createDiv();
  const link = element.createDiv().createEl('a', { text: '1d6' });
  return { element, link };
}

const press = (x: number, y: number, pointer: PointerInit = {}): PointerEvent => pointerEvent('pointerdown', { clientX: x, clientY: y, ...pointer });
const moveTo = (x: number, y: number, pointer: PointerInit = {}): boolean => document.dispatchEvent(pointerEvent('pointermove', { clientX: x, clientY: y, ...pointer }));
const release = (pointer: PointerInit = {}): boolean => document.dispatchEvent(pointerEvent('pointerup', pointer));

describe('moving a preview window', () => {
  beforeEach(() => { installPointerEvents(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.empty();
  });

  it('moves under a finger as under the mouse, holding the finger from the press', () => {
    const { element } = previewWindow();
    const onEnd = vi.fn();
    const finger: PointerInit = { pointerType: 'touch', pointerId: 5 };
    startPreviewWindowDrag(element, press(950, 120, finger), reach, onEnd);
    expect(element.hasPointerCapture(5)).toBe(true);

    moveTo(980, 150, finger);
    expect([element.style.left, element.style.top]).toEqual(['30px', '30px']);
    // A second finger laid on the screen neither moves nor ends it
    moveTo(400, 400, { pointerType: 'touch', pointerId: 6 });
    release({ pointerType: 'touch', pointerId: 6 });
    expect([element.style.left, element.style.top]).toEqual(['30px', '30px']);
    expect(onEnd).not.toHaveBeenCalled();

    release(finger);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(element.hasPointerCapture(5)).toBe(false);
    expect(element.classList.contains('is-dragging')).toBe(false);
    moveTo(1100, 300, finger);
    expect([element.style.left, element.style.top]).toEqual(['30px', '30px']);
  });

  it('ends where a lost finger left the window, and swallows no click', () => {
    vi.useFakeTimers();
    const { element, link } = previewWindow();
    const rolled = vi.fn();
    element.addEventListener('click', rolled);
    const onEnd = vi.fn();
    const finger: PointerInit = { pointerType: 'touch', pointerId: 5 };
    startPreviewWindowDrag(element, press(950, 120, finger), reach, onEnd, 4);
    moveTo(980, 140, finger);
    document.dispatchEvent(pointerEvent('pointercancel', finger));
    expect([element.style.left, element.style.top]).toEqual(['30px', '20px']);
    expect(onEnd).toHaveBeenCalledTimes(1);
    link.click();
    expect(rolled).toHaveBeenCalledTimes(1);
  });

  it('holds the pointer of a handle with links only once it drags, so a click reaches the link', () => {
    vi.useFakeTimers();
    const { element } = previewWindow();
    startPreviewWindowDrag(element, press(950, 120), reach, () => undefined, 4);
    moveTo(952, 121);
    expect(element.hasPointerCapture(1)).toBe(false);
    moveTo(980, 140);
    expect(element.hasPointerCapture(1)).toBe(true);
    release();
    // The click the release would send is waited for until the next task
    vi.runAllTimers();
  });

  it('stops a drag whose window closes under it', () => {
    const { element } = previewWindow();
    const onEnd = vi.fn();
    const stop = startPreviewWindowDrag(element, press(950, 120), reach, onEnd);
    moveTo(960, 130);
    stop();
    moveTo(990, 160);
    release();
    expect([element.style.left, element.style.top]).toEqual(['10px', '10px']);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('never moves its controls out of the map view', () => {
    const { element } = previewWindow();
    startPreviewWindowDrag(element, press(950, 120), reach, () => undefined);

    moveTo(950 + 3000, 120 + 3000);
    expect([element.style.left, element.style.top]).toEqual(['300px', '700px']);
    moveTo(950 - 3000, 120 - 3000);
    expect([element.style.left, element.style.top]).toEqual(['-600px', '-60px']);
    release();
  });

  it('moves by a header with links only past the threshold, and swallows the click that ends the move', () => {
    vi.useFakeTimers();
    const { element, link } = previewWindow();
    const rolled = vi.fn();
    element.addEventListener('click', rolled);
    const onEnd = vi.fn();

    // A click on a roll in the header still rolls.
    startPreviewWindowDrag(element, press(950, 120), reach, onEnd, 4);
    moveTo(952, 121);
    release();
    link.click();
    expect(element.style.left).toBe('');
    expect(onEnd).not.toHaveBeenCalled();
    expect(rolled).toHaveBeenCalledTimes(1);

    startPreviewWindowDrag(element, press(950, 120), reach, onEnd, 4);
    moveTo(980, 140);
    expect(element.classList.contains('is-dragging')).toBe(true);
    expect([element.style.left, element.style.top]).toEqual(['30px', '20px']);
    release();
    link.click();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(rolled).toHaveBeenCalledTimes(1);

    // Only that one click.
    vi.runAllTimers();
    link.click();
    expect(rolled).toHaveBeenCalledTimes(2);
  });
});
