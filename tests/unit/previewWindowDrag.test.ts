// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPreviewWindowDrag, type PreviewWindowReach } from '../../src/app/services/previewWindowControls';

/** A map view at 300, 40 of 1000 × 800 and a window whose controls sit at its top right. */
const FRAME = { left: 300, top: 40, right: 1300, bottom: 840 };
const REACH = { left: 900, top: 100, right: 1000, bottom: 140 };
const reach: PreviewWindowReach = { reach: () => REACH, frame: () => FRAME };

function previewWindow(): { element: HTMLElement; link: HTMLElement } {
  const element = document.body.createDiv();
  const link = element.createDiv().createEl('a', { text: '1d6' });
  return { element, link };
}

const press = (x: number, y: number): MouseEvent =>
  new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y });
const moveTo = (x: number, y: number): boolean => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const release = (): boolean => document.dispatchEvent(new MouseEvent('mouseup'));

describe('moving a preview window', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.empty();
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
