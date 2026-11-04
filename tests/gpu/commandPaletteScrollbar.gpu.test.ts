import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { OverlayScroll } from '../../src/app/packages/components/primitives/OverlayScroll';

/** The Obsidian variables the palette's sizes and colours come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --font-ui-small: 13px; --font-ui-smaller: 12px; --line-height-tight: 1.3; --font-interface: sans-serif;
    --background-primary: #1e1e1e; --text-muted: #b3b3b3; --scrollbar-thumb-bg: rgba(255, 255, 255, 0.2);
    --scrollbar-active-thumb-bg: rgba(255, 255, 255, 0.4); }
`;
/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function Palette({ rows }: { rows: number }): React.JSX.Element {
  return React.createElement(
    'div',
    { className: 'atlas-command-palette-container' },
    React.createElement(
      OverlayScroll,
      { frameClassName: 'atlas-command-palette-options-frame', className: 'atlas-command-palette-options' },
      React.createElement(
        'div',
        { className: 'atlas-command-palette-options-inner' },
        Array.from({ length: rows }, (_, index) =>
          React.createElement('button', { key: index, className: 'atlas-command-item' }, `Command ${index}`)),
      ),
    ),
  );
}

let host: HTMLElement;
let root: Root;
const style = document.createElement('style');
style.textContent = OBSIDIAN;

beforeEach(() => {
  document.head.append(style);
  host = document.createElement('div');
  host.className = 'atlas-vtt-plugin';
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
  style.remove();
});

it.each([3, 60])('keeps the rows as far from both sides of the palette with %i rows', async (rows) => {
  flushSync(() => root.render(React.createElement(Palette, { rows })));
  await nextFrame();
  await nextFrame();

  const container = host.querySelector<HTMLElement>('.atlas-command-palette-container')!;
  const area = host.querySelector<HTMLElement>('.atlas-command-palette-options')!;
  const row = host.querySelector<HTMLElement>('.atlas-command-item')!.getBoundingClientRect();
  const panel = container.getBoundingClientRect();
  const border = parseFloat(getComputedStyle(container).borderLeftWidth);

  expect(area.scrollHeight > area.clientHeight).toBe(rows > 3);
  expect(area.offsetWidth - area.clientWidth).toBe(0);
  expect(Math.abs((row.left - panel.left) - (panel.right - row.right))).toBeLessThan(SLACK);
  expect(row.left - panel.left - border).toBeCloseTo(8, 0);

  const track = host.querySelector<HTMLElement>('.atlas-overlay-scroll__track')!;
  expect(track.hasAttribute('data-scrollable')).toBe(rows > 3);
  if (rows > 3) {
    // The thumb lies in the padding beside the rows, never over them.
    const thumb = host.querySelector<HTMLElement>('.atlas-overlay-scroll__thumb')!.getBoundingClientRect();
    expect(thumb.left).toBeGreaterThanOrEqual(row.right - SLACK);
    expect(thumb.right).toBeLessThanOrEqual(panel.right - border + SLACK);
    expect(thumb.height).toBeGreaterThanOrEqual(24);

    area.scrollTop = area.scrollHeight;
    await nextFrame();
    const track = host.querySelector<HTMLElement>('.atlas-overlay-scroll__track')!.getBoundingClientRect();
    const end = host.querySelector<HTMLElement>('.atlas-overlay-scroll__thumb')!.getBoundingClientRect();
    expect(Math.abs(end.bottom - track.bottom)).toBeLessThan(SLACK);
  }
});
