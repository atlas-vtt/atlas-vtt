import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OverlayScrollbars } from '../../src/app/ui/overlayScrollbars/OverlayScrollbars';

/**
 * Atlas' overlay scrollbars in a real layout (`styles/_overlay-scrollbars.scss`, `src/app/ui/overlayScrollbars/`): a
 * scroll area's native scrollbar takes no room, so its padding is the same on both sides, and the thumb drawn over
 * it holds still in the area's view while the content scrolls, whether the area is positioned or not.
 * The browser tests run with scrollbars shown (`vitest.config.mts`), so a native one would take its width here.
 */
const OBSIDIAN = `
  body { margin: 0; --font-ui-small: 13px; --font-ui-smaller: 12px; --line-height-tight: 1.3; --font-interface: sans-serif;
    --background-primary: #1e1e1e; --text-muted: #b3b3b3; --scrollbar-thumb-bg: rgba(255, 255, 255, 0.2);
    --scrollbar-active-thumb-bg: rgba(255, 255, 255, 0.4); }
  .atlas-test-area { width: 300px; height: 200px; overflow: auto; padding: 8px; box-sizing: border-box; }
  .atlas-test-area--positioned { position: relative; }
  .atlas-test-row { height: 40px; margin-bottom: 8px; background: #444; }
  .atlas-test-wide { width: 900px; }
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
      'div',
      { className: 'atlas-command-palette-options' },
      React.createElement(
        'div',
        { className: 'atlas-command-palette-options-inner' },
        Array.from({ length: rows }, (_, index) =>
          React.createElement('button', { key: index, className: 'atlas-command-item' }, `Command ${index}`)),
      ),
    ),
  );
}

const part = (area: HTMLElement, name: string): HTMLElement => area.shadowRoot!.querySelector<HTMLElement>(`[part~="${name}"]`)!;
const shown = (area: HTMLElement): boolean => area.shadowRoot?.querySelector('[part~="frame"]')?.getAttribute('part')?.includes('shown') ?? false;

/** The area's padding box on screen: where its overlay is drawn. */
function paddingBox(area: HTMLElement): DOMRect {
  const rect = area.getBoundingClientRect();
  return new DOMRect(rect.left + area.clientLeft, rect.top + area.clientTop, area.clientWidth, area.clientHeight);
}

async function scrollTo(area: HTMLElement, top: number, left = 0): Promise<void> {
  area.scrollTo({ top, left, behavior: 'instant' });
  await expect.poll(() => shown(area), { timeout: 2000 }).toBe(true);
  await nextFrame();
  await nextFrame();
}

let host: HTMLElement;
let root: Root;
let scrollbars: OverlayScrollbars;
const style = document.createElement('style');
style.textContent = OBSIDIAN;

beforeEach(() => {
  document.head.append(style);
  host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  root = createRoot(host);
  scrollbars = new OverlayScrollbars(document);
});

afterEach(() => {
  scrollbars.destroy();
  root.unmount();
  host.remove();
  style.remove();
});

it.each([3, 60])('keeps the rows as far from both sides of the palette with %i rows', async (rows) => {
  flushSync(() => root.render(React.createElement(Palette, { rows })));
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
  if (rows <= 3) return;

  await scrollTo(area, 0.5);
  // The thumb is drawn in the padding beside the rows, never over them, and stays in the area's view.
  const thumb = part(area, 'thumb-y');
  const drawn = thumb.getBoundingClientRect();
  expect(drawn.left + parseFloat(getComputedStyle(thumb).borderLeftWidth)).toBeGreaterThanOrEqual(row.right - SLACK);
  expect(drawn.right).toBeLessThanOrEqual(panel.right - border + SLACK);
  expect(drawn.height).toBeGreaterThanOrEqual(24);
  await scrollTo(area, area.scrollHeight);
  const end = thumb.getBoundingClientRect();
  expect(Math.abs(end.bottom - paddingBox(area).bottom)).toBeLessThan(SLACK);
});

describe.each([
  ['an area that is not positioned', 'atlas-test-area'],
  ['a positioned area (the containing block of its content)', 'atlas-test-area atlas-test-area--positioned'],
])('in %s', (_name, className) => {
  function mountArea(rows = 30, wide = false): HTMLElement {
    const area = host.createDiv({ cls: className });
    for (let index = 0; index < rows; index++) area.createDiv({ cls: wide ? 'atlas-test-row atlas-test-wide' : 'atlas-test-row' });
    return area;
  }

  it('takes no room and holds the thumbs still over the padding box while the content scrolls', async () => {
    const area = mountArea(30, true);
    expect(area.offsetWidth - area.clientWidth).toBe(0);
    expect(area.offsetHeight - area.clientHeight).toBe(0);
    for (const [top, left] of [[1, 0], [300, 200], [area.scrollHeight, area.scrollWidth]] as const) {
      await scrollTo(area, top, left);
      const frame = part(area, 'frame').getBoundingClientRect();
      const box = paddingBox(area);
      expect([frame.left, frame.top, frame.right, frame.bottom].map(Math.round)).toEqual([box.left, box.top, box.right, box.bottom].map(Math.round));
    }
    // At the end of both axes each thumb has reached the end of its track, short of the corner they share.
    const box = paddingBox(area);
    expect(Math.abs(part(area, 'thumb-y').getBoundingClientRect().bottom - (box.bottom - 12))).toBeLessThan(1);
    expect(Math.abs(part(area, 'thumb-x').getBoundingClientRect().right - (box.right - 12))).toBeLessThan(1);
  });

  it('fades the thumbs a second after the scroll', async () => {
    const area = mountArea();
    await scrollTo(area, 100);
    await expect.poll(() => getComputedStyle(part(area, 'frame')).opacity, { timeout: 1000 }).toBe('1');
    await expect.poll(() => shown(area), { timeout: 2500 }).toBe(false);
    await expect.poll(() => getComputedStyle(part(area, 'frame')).visibility, { timeout: 1000 }).toBe('hidden');
  });

  it('scrolls the area when its thumb is dragged, and keeps the press from the area', async () => {
    const area = mountArea();
    const pressed: string[] = [];
    area.addEventListener('pointerdown', () => pressed.push('area'));
    await scrollTo(area, 1);
    const thumb = part(area, 'thumb-y');
    const at = thumb.getBoundingClientRect();
    const send = (type: string, y: number): void => {
      thumb.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: at.left + 6, clientY: y }));
    };
    send('pointerdown', at.top + 5);
    send('pointermove', at.top + 5 + 60);
    send('pointerup', at.top + 5 + 60);
    const range = area.scrollHeight - area.clientHeight;
    const travel = area.clientHeight - at.height;
    expect(area.scrollTop).toBeCloseTo(1 + (60 * range) / travel, -1);
    expect(pressed).toEqual([]);
  });
});

it('keeps the scroll offsets of the areas inside one that gets its scrollbar', async () => {
  const outer = host.createDiv({ cls: 'atlas-test-area' });
  outer.style.height = '300px';
  const inner = outer.createDiv({ cls: 'atlas-test-area' });
  for (let index = 0; index < 30; index++) inner.createDiv({ cls: 'atlas-test-row' });
  for (let index = 0; index < 10; index++) outer.createDiv({ cls: 'atlas-test-row' });
  await scrollTo(inner, 150);
  await scrollTo(outer, 80);
  expect(outer.shadowRoot).not.toBeNull();
  expect(outer.scrollTop).toBe(80);
  expect(inner.scrollTop).toBe(150);
});

it('leaves an area that scrolls bare alone, and Obsidian\'s own areas their native scrollbar', async () => {
  // What `atlas-scrollbar-none` sets.
  const bare = host.createDiv({ cls: 'atlas-test-area' });
  bare.setCssProps({ '--atlas-scrollbar': 'none' });
  const native = host.createDiv();
  native.setCssProps({ width: '300px', height: '200px', overflow: 'auto' });
  for (const area of [bare, native]) for (let index = 0; index < 30; index++) area.createDiv({ cls: 'atlas-test-row' });
  bare.scrollTop = 100;
  native.scrollTop = 100;
  await nextFrame();
  await nextFrame();
  expect(bare.shadowRoot).toBeNull();
  expect(bare.offsetWidth - bare.clientWidth).toBe(0);
  expect(native.shadowRoot).toBeNull();
  expect(native.offsetWidth - native.clientWidth).toBeGreaterThan(0);
});
