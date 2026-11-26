import '../setup/obsidianDom';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PalettePage, PaletteSurface } from '../../src/app/react/components/command-palette/PaletteMorph';

/** The part of _palette.scss the morph depends on: a clipping surface around pages placed at their own size. */
const LAYOUT = `
  .atlas-command-palette-surface { position: relative; box-sizing: content-box; overflow: hidden; border: 2px solid; border-radius: 16px; }
  .atlas-command-palette-container { box-sizing: border-box; display: flex; flex-direction: column; width: 600px; height: 450px; }
  .atlas-command-palette-container--expanded { width: 900px; height: auto; }
  .atlas-command-palette-surface > .atlas-command-palette-container { position: absolute; top: 0; left: 50%; translate: -50% 0; transform-origin: top center; }
  .rows { display: flex; flex-wrap: wrap; gap: 8px; }
  .rows > div { width: 200px; height: 40px; }
`;
/** Longer than the morph's spring. */
const MORPH_FRAMES = 45;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function page(key: string, expanded: boolean): React.ReactElement {
  const rows = Array.from({ length: expanded ? 12 : 4 }, (_, i) => React.createElement('div', { key: i }));
  return React.createElement(PalettePage, {
    key,
    className: expanded ? 'atlas-command-palette-container atlas-command-palette-container--expanded' : 'atlas-command-palette-container',
    children: React.createElement('div', { className: 'rows', 'data-page': key }, rows),
  });
}

describe('the command palette morphing between list and page', () => {
  const style = document.createElement('style');
  style.textContent = LAYOUT;
  let host: HTMLElement;
  let root: Root;

  const show = (key: 'list' | 'grid'): void => flushSync(() => root.render(
    React.createElement(PaletteSurface, { depth: key === 'list' ? -1 : 1, surfaceRef: null, children: page(key, key !== 'list') }),
  ));
  const surface = (): HTMLElement => host.querySelector<HTMLElement>('.atlas-command-palette-surface')!;

  beforeEach(async () => {
    document.head.append(style);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    show('list');
    // The first frame is the opening: the surface takes its size at once.
    await nextFrame();
    await nextFrame();
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    style.remove();
  });

  it('opens at its page size and springs to the next page without stretching or reflowing it', async () => {
    expect(surface().offsetWidth).toBe(604);
    expect(surface().offsetHeight).toBe(454);
    const grid = (): HTMLElement | null => host.querySelector<HTMLElement>('[data-page="grid"]');

    show('grid');
    const target = grid()!.parentElement!;
    const widths: number[] = [];
    let pageWidths = new Set<number>();
    for (let i = 0; i < MORPH_FRAMES; i++) {
      await nextFrame();
      const drawn = surface().getBoundingClientRect();
      // The surface is resized, never scaled: its corners, border and shadow keep their shape.
      expect(drawn.width).toBeCloseTo(surface().offsetWidth, 0);
      widths.push(surface().offsetWidth);
      pageWidths.add(target.offsetWidth);
    }
    // The page is laid out at its own size throughout; only the surface moves.
    expect([...pageWidths]).toEqual([900]);
    // A real morph: in between sizes, and settled on the page's size.
    expect(widths.some((w) => w > 610 && w < 890)).toBe(true);
    expect(surface().offsetWidth).toBe(target.offsetWidth + 4);
    expect(surface().offsetHeight).toBe(target.offsetHeight + 4);
    // The list has left once its fade is over.
    expect(host.querySelectorAll('[data-page="list"]').length).toBe(0);

    show('list');
    pageWidths = new Set<number>();
    for (let i = 0; i < MORPH_FRAMES; i++) {
      await nextFrame();
      const list = host.querySelector<HTMLElement>('[data-page="list"]')!.parentElement!;
      pageWidths.add(list.offsetWidth);
    }
    expect([...pageWidths]).toEqual([600]);
    expect(surface().offsetWidth).toBe(604);
    expect(surface().offsetHeight).toBe(454);
  });

  it('keeps the leaving page out of reach while it fades', async () => {
    show('grid');
    await nextFrame();
    const leaving = host.querySelector<HTMLElement>('[data-page="list"]')!.parentElement!;
    expect(leaving.inert).toBe(true);
    expect(leaving.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector<HTMLElement>('[data-page="grid"]')!.parentElement!.inert).toBe(false);
  });
});
