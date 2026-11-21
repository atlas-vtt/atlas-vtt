import { afterEach, describe, expect, it } from 'vitest';
import { keepViewInPlace } from '../../src/app/utils/keepViewInPlace';

const nextFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

/**
 * Obsidian's containers around a map view show no scrollbar, yet a focus of a field that pokes
 * past their edge scrolls them, and the whole view stood shifted with a strip beside it.
 */
describe('keepViewInPlace', () => {
  const outer = document.createElement('div');
  outer.style.cssText = 'position: relative; width: 600px; height: 400px; overflow: hidden';
  const view = document.createElement('div');
  view.style.cssText = 'position: relative; width: 600px; height: 400px';
  outer.append(view);
  const field = document.createElement('input');
  field.style.cssText = 'position: absolute; left: 620px; top: 10px; width: 100px';
  view.append(field);
  const listener = (event: Event): void => keepViewInPlace(event.target, view);

  afterEach(() => {
    document.removeEventListener('scroll', listener, true);
    outer.remove();
    outer.scrollLeft = 0;
  });

  it('a focus scrolls a hidden overflow sideways (what shifted the view)', async () => {
    document.body.append(outer);
    field.focus();
    await nextFrame();
    expect(outer.scrollLeft).toBeGreaterThan(0);
  });

  it('puts that container back, at once', async () => {
    document.body.append(outer);
    document.addEventListener('scroll', listener, true);
    field.focus();
    await nextFrame();
    await nextFrame();
    expect(outer.scrollLeft).toBe(0);
  });

  it('leaves alone a container that scrolls on purpose', async () => {
    const list = document.createElement('div');
    list.style.cssText = 'width: 100px; height: 50px; overflow: auto';
    list.append(Object.assign(document.createElement('div'), { style: 'height: 500px' }));
    view.append(list);
    document.body.append(outer);
    document.addEventListener('scroll', listener, true);
    list.scrollTop = 100;
    await nextFrame();
    expect(list.scrollTop).toBe(100);
    list.remove();
  });
});
