import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { DARK, openSoundTab, openSoundView, seedMoods, type SoundTab, type SoundViewTab } from './sound/soundTabHarness';

// As in soundTab.gpu.test.ts: statblocks reach Node's `events`, and the DM screen is here to be compared with.
vi.mock('../../src/app/react/components/dm-screen/DMStatblocksPane', async () => {
  const { createElement } = await import('react');
  return { DMStatblocksPane: () => createElement('div', { className: 'atlas-dm-statblocks-section' }) };
});
vi.mock('../../src/app/react/components/dm-screen/useDMScreenStatblocks', () => ({ useDMScreenStatblocks: () => ({ statblocks: new Map(), loading: false }) }));

const SHOTS = '__screenshots__/sound-view';

function box(selector: string): DOMRect {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element.getBoundingClientRect();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms); });

describe('the Sound page in a tab of its own', () => {
  let viewport: HTMLElement;
  let open: SoundViewTab | SoundTab | null = null;

  beforeEach(() => {
    viewport = document.body.createDiv();
  });

  afterEach(() => {
    open?.unmount();
    open = null;
    viewport.remove();
  });

  async function size(width: number, height: number): Promise<void> {
    await page.viewport(width, height);
    viewport.style.cssText = `position: absolute; top: 0; left: 0; width: ${width}px; height: ${height}px; contain: strict; overflow: hidden`;
  }

  async function view(width: number, height: number): Promise<SoundViewTab> {
    await size(width, height);
    const tab = await openSoundView(DARK, viewport);
    open = tab;
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(11);
    await act(async () => { await sleep(350); });
    return tab;
  }

  it('keeps one inset on all four sides and shows no page control', async () => {
    await view(1644, 960);
    const tab = box('.atlas-sound-view');
    expect(tab.width).toBe(1644);
    expect(tab.height).toBe(960);
    expect(getComputedStyle(document.querySelector('.atlas-sound-view')!).paddingTop).toBe('0px');
    const pane = box('.atlas-sound-pane');
    const inset = 1644 * 0.03;
    expect(pane.left - tab.left).toBeCloseTo(inset, 0);
    expect(pane.top - tab.top).toBeCloseTo(inset, 0);
    expect(tab.right - pane.right).toBeCloseTo(inset, 0);
    expect(tab.bottom - pane.bottom).toBeCloseTo(inset, 0);
    expect(document.querySelector('.atlas-dm-screen-pages')).toBeNull();
    await page.screenshot({ path: `${SHOTS}/1644-dark.png` });
  });

  it('has the DM screen\'s proportions: only the page control\'s height is the tab\'s to give to the stage', async () => {
    await size(1644, 960);
    const screen = await openSoundTab(DARK, viewport);
    open = screen;
    seedMoods(screen);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(11);
    await act(async () => { await sleep(350); });
    const before = { pane: box('.atlas-sound-pane'), lib: box('.atlas-sound-lib'), moods: box('.atlas-sound-moods'), desk: box('.atlas-sound-desk'), mood: box('.atlas-sound-mood') };
    screen.unmount();
    open = null;

    await view(1644, 960);
    expect(box('.atlas-sound-pane').width).toBeCloseTo(before.pane.width, 0);
    expect(box('.atlas-sound-lib').width).toBeCloseTo(before.lib.width, 0);
    expect(box('.atlas-sound-moods').width).toBeCloseTo(before.moods.width, 0);
    expect(box('.atlas-sound-desk').height).toBe(before.desk.height);
    expect(box('.atlas-sound-mood').width).toBeCloseTo(before.mood.width, 0);
    expect(box('.atlas-sound-mood').height).toBe(before.mood.height);
    // The library takes 58 parts of what the moods share with it, as there.
    expect(box('.atlas-sound-lib').width / box('.atlas-sound-pane').width).toBeCloseTo(0.58, 1);
    // The stage grows by what the control and its gap took, and nothing else moves.
    expect(box('.atlas-sound-lib').height).toBeGreaterThan(before.lib.height);
  });

  it('follows the tab\'s own width: three tiles across at 1644, two at 1280, stacked below the breakpoint', async () => {
    await view(1644, 960);
    const across = (): number => {
      const tops = [...document.querySelectorAll('.atlas-sound-mood')].map((mood) => mood.getBoundingClientRect().top);
      return tops.filter((top) => top === tops[0]).length;
    };
    expect(across()).toBe(3);

    await size(1280, 820);
    await act(async () => { await sleep(100); });
    expect(across()).toBe(2);
    expect(box('.atlas-sound-lib').top).toBe(box('.atlas-sound-moods').top);

    await size(700, 800);
    await act(async () => { await sleep(100); });
    expect(box('.atlas-sound-lib').left).toBe(box('.atlas-sound-moods').left);
    expect(box('.atlas-sound-moods').top).toBeGreaterThanOrEqual(box('.atlas-sound-lib').bottom - 1);
    expect(box('.atlas-sound-desk').bottom).toBeLessThanOrEqual(box('.atlas-sound-pane').bottom);
    await page.screenshot({ path: `${SHOTS}/700-dark.png` });
  });

  it('reads its meters only while it is in front: another tab covering it closes them', async () => {
    const tab = await view(1280, 820);
    const closed = vi.fn();
    const realOpenMeters = tab.director.openMeters.bind(tab.director);
    const openMeters = vi.spyOn(tab.director, 'openMeters').mockImplementation(() => {
      const close = realOpenMeters();
      return () => {
        closed();
        close();
      };
    });
    tab.director.shelf.request([...tab.records.values()]);
    await expect.poll(() => [...tab.records.values()].every((record) => tab.director.shelf.stateOf(record).state === 'ready'), { timeout: 60_000, interval: 100 }).toBe(true);
    await act(async () => { tab.director.press(tab.moods.moods()[2]!); await sleep(0); });
    await act(async () => { tab.director.press(tab.moods.moods()[1]!); await sleep(0); });
    await expect.poll(() => openMeters.mock.calls.length).toBe(1);

    tab.contentEl.style.display = 'none';
    await expect.poll(() => closed.mock.calls.length).toBe(1);

    tab.contentEl.style.display = '';
    await expect.poll(() => openMeters.mock.calls.length).toBe(2);
  });
});
