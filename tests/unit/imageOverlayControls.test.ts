// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageOverlayControls } from '../../src/app/services/imageOverlayControls';
import { installPointerEvents, pointerEvent, type PointerInit } from '../helpers/pointerEvents';

function setup(): { container: HTMLDivElement; image: HTMLImageElement; close: HTMLButtonElement; dismiss: ReturnType<typeof vi.fn>; controls: ImageOverlayControls } {
  const container = document.body.createDiv({ cls: 'atlas-image-display' });
  const image = container.createEl('img');
  const close = container.createEl('button', { cls: 'atlas-image-display__close' });
  // The image covers 100..300 on both axes; jsdom does no layout
  image.getBoundingClientRect = (): DOMRect => ({ left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100, toJSON: () => ({}) });
  const dismiss = vi.fn();
  const controls = new ImageOverlayControls(container, image, window, dismiss);
  return { container, image, close, dismiss, controls };
}

function click(target: Element, from: { x: number; y: number }, to = from, pointer: PointerInit = {}): void {
  target.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: from.x, clientY: from.y, ...pointer }));
  document.dispatchEvent(pointerEvent('pointermove', { clientX: to.x, clientY: to.y, ...pointer }));
  document.dispatchEvent(pointerEvent('pointerup', { button: 0, clientX: to.x, clientY: to.y, ...pointer }));
}

beforeEach(() => { installPointerEvents(); });
afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ImageOverlayControls', () => {
  it('dismisses on a click beside the image', () => {
    const { container, dismiss } = setup();
    click(container, { x: 20, y: 20 });
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the image for a click on it and for a drag that pans it', () => {
    const { container, image, dismiss } = setup();
    click(container, { x: 200, y: 200 });
    click(container, { x: 20, y: 20 }, { x: 80, y: 60 });
    expect(dismiss).not.toHaveBeenCalled();
    expect(image.style.transform).toBe('translate(60px, 40px) scale(1)');
  });

  it('leaves presses on the close button to the button', () => {
    const { close, dismiss } = setup();
    click(close, { x: 20, y: 20 });
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('dismisses on Escape even when a focused element stops the key', () => {
    const { container, dismiss } = setup();
    const focused = document.body.createEl('input');
    focused.addEventListener('keydown', (event) => event.stopPropagation());
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it('pans an image on a turned table TV the way the pointer moves', () => {
    const container = document.body.createDiv({ cls: 'atlas-image-display' });
    const image = container.createEl('img');
    // Turned a quarter clockwise: a drag to the right on screen is a drag up in the turned layer
    new ImageOverlayControls(container, image, window, vi.fn(), () => 90);
    click(container, { x: 20, y: 20 }, { x: 80, y: 20 });
    expect(image.style.transform).toBe('translate(0px, -60px) scale(1)');
  });

  it('pans under a finger as under the mouse, and a second finger changes nothing', () => {
    const { container, image, dismiss } = setup();
    const finger: PointerInit = { pointerType: 'touch', pointerId: 7 };
    container.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 200, ...finger }));
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 230, clientY: 210, ...finger }));
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900, pointerType: 'touch', pointerId: 8 }));
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 900, clientY: 900, pointerType: 'touch', pointerId: 8 }));
    expect(image.style.transform).toBe('translate(30px, 10px) scale(1)');
    expect(container.classList.contains('is-dragging')).toBe(true);
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 230, clientY: 210, ...finger }));
    expect(container.classList.contains('is-dragging')).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('keeps the image where a lost pointer left it, without dismissing it', () => {
    const { container, image, dismiss } = setup();
    const finger: PointerInit = { pointerType: 'touch', pointerId: 7 };
    container.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 20, clientY: 20, ...finger }));
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 22, clientY: 21, ...finger }));
    document.dispatchEvent(pointerEvent('pointercancel', { clientX: 22, clientY: 21, ...finger }));
    expect(container.classList.contains('is-dragging')).toBe(false);
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 300, ...finger }));
    expect(image.style.transform).toBe('translate(2px, 1px) scale(1)');
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('stops listening once detached', () => {
    const { container, dismiss, controls } = setup();
    controls.detach();
    click(container, { x: 20, y: 20 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dismiss).not.toHaveBeenCalled();
  });
});
