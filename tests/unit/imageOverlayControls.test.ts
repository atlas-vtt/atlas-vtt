// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageOverlayControls } from '../../src/app/services/imageOverlayControls';

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

function click(target: Element, from: { x: number; y: number }, to = from): void {
  target.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: from.x, clientY: from.y, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: to.x, clientY: to.y, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: to.x, clientY: to.y, bubbles: true }));
}

afterEach(() => { document.body.empty(); });

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

  it('stops listening once detached', () => {
    const { container, dismiss, controls } = setup();
    controls.detach();
    click(container, { x: 20, y: 20 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dismiss).not.toHaveBeenCalled();
  });
});
