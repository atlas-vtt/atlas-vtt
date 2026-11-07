import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { DARK, openSoundTab, seedMoods, SOUNDS, type SoundTab } from './sound/soundTabHarness';

vi.mock('../../src/app/react/components/dm-screen/DMStatblocksPane', async () => {
  const { createElement } = await import('react');
  return { DMStatblocksPane: () => createElement('div', { className: 'atlas-dm-statblocks-section' }, createElement('div', { className: 'atlas-dm-statblocks-grid' })) };
});
vi.mock('../../src/app/react/components/dm-screen/useDMScreenStatblocks', () => ({ useDMScreenStatblocks: () => ({ statblocks: new Map(), loading: false }) }));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms); });

function box(selector: string): DOMRect {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element.getBoundingClientRect();
}

/** The fade a row's mask ends in on each side, in px, and whether there is a mask at all. */
function fades(row: HTMLElement): { start: string; end: string; masked: boolean } {
  const style = getComputedStyle(row);
  return { start: style.getPropertyValue('--atlas-strips-fade-start').trim(), end: style.getPropertyValue('--atlas-strips-fade-end').trim(), masked: style.maskImage.includes('linear-gradient') };
}

describe('the desk’s strips at a narrow width', () => {
  let viewport: HTMLElement;
  let tab: SoundTab | null = null;

  beforeEach(() => {
    viewport = document.body.createDiv();
  });

  afterEach(() => {
    tab?.unmount();
    tab = null;
    viewport.remove();
  });

  async function openWithLayers(width: number): Promise<HTMLElement> {
    await page.viewport(width, 800);
    viewport.style.cssText = `position: absolute; top: 0; left: 0; width: ${width}px; height: 800px; contain: strict; overflow: hidden`;
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    tab.director.shelf.request([...tab.records.values()]);
    const { director, records } = tab;
    await expect.poll(() => [...records.values()].every((record) => director.shelf.stateOf(record).state === 'ready'), { timeout: 60_000, interval: 100 }).toBe(true);
    for (const [name, { kind }] of Object.entries(SOUNDS)) {
      const record = records.get(name);
      if (kind === 'ambience' && record) act(() => { director.desk.addSound(record); });
    }
    const row = document.querySelector<HTMLElement>('.atlas-sound-strips__mix')!;
    await expect.poll(() => row.querySelectorAll('.atlas-sound-strip').length).toBeGreaterThan(2);
    await act(async () => { await sleep(100); });
    return row;
  }

  it('scrolls sideways, fades the side with more to come, and keeps Master and Stop all in place', async () => {
    const row = await openWithLayers(720);
    const silence = box('.atlas-sound-stop-all');
    const master = box('.atlas-sound-strip--master');
    const strips = box('.atlas-sound-strips');

    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth + 100);
    expect(getComputedStyle(row).overflowX).toBe('auto');
    // This browser's scrollbar takes room, and none of it from a fader: the row's strips end where Master does.
    expect(row.offsetHeight - row.clientHeight).toBeGreaterThan(0);
    expect(box('.atlas-sound-strips__mix .atlas-sound-strip').bottom).toBe(master.bottom);
    expect(box('.atlas-sound-strips__mix .atlas-sound-strip').top).toBe(master.top);
    expect(fades(row)).toEqual({ start: '0px', end: '40px', masked: true });
    // The row stops before Master, and its fade lies on what is cut, which goes on under it.
    expect(box('.atlas-sound-strips__mix').right).toBeLessThanOrEqual(master.left);
    const last = [...row.children].at(-1)!.getBoundingClientRect();
    expect(last.right).toBeGreaterThan(box('.atlas-sound-strips__mix').right);
    const cut = [...row.children].map((child) => child.getBoundingClientRect()).find((strip) => strip.left < box('.atlas-sound-strips__mix').right && strip.right > box('.atlas-sound-strips__mix').right);
    expect(cut, 'a strip stands cut by the row’s end, which says the row goes on').toBeDefined();

    row.scrollLeft = 120;
    await expect.poll(() => fades(row)).toEqual({ start: '40px', end: '40px', masked: true });

    row.scrollLeft = row.scrollWidth;
    await expect.poll(() => fades(row)).toEqual({ start: '40px', end: '0px', masked: true });
    const end = [...row.children].at(-1)!.getBoundingClientRect();
    expect(end.right).toBeLessThanOrEqual(box('.atlas-sound-strips__mix').right + 1);

    // Scrolling moved none of what stays.
    expect(box('.atlas-sound-stop-all').left).toBe(silence.left);
    expect(box('.atlas-sound-strip--master').left).toBe(master.left);
    expect(box('.atlas-sound-stop-all').right).toBeLessThanOrEqual(strips.right);

    row.scrollLeft = 0;
    await expect.poll(() => fades(row)).toEqual({ start: '0px', end: '40px', masked: true });
  });

  it('has no mask where everything fits, and takes one as soon as a window narrows', async () => {
    const row = await openWithLayers(1900);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    expect(fades(row)).toEqual({ start: '0px', end: '0px', masked: false });
    viewport.style.width = '720px';
    await expect.poll(() => fades(row)).toEqual({ start: '0px', end: '40px', masked: true });
  });

  it('takes a strip that pushes the row past its end', async () => {
    const row = await openWithLayers(1900);
    viewport.style.width = `${box('.atlas-dm-screen').width}px`;
    const spare = row.clientWidth - row.scrollWidth;
    const added = row.ownerDocument.createElement('div');
    added.style.cssText = `flex: none; width: ${spare + row.clientWidth}px`;
    row.append(added);
    await expect.poll(() => fades(row).masked).toBe(true);
    added.remove();
    await expect.poll(() => fades(row).masked).toBe(false);
  });
});
