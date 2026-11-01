import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { COLLECTION, DARK, LIGHT, openSoundTab, seedMoods, type SoundTab } from './sound/soundTabHarness';

// Statblocks reach Node's `events` through the token link service, which a browser test cannot import; this file is about the page beside them.
vi.mock('../../src/app/react/components/dm-screen/DMStatblocksPane', async () => {
  const { createElement } = await import('react');
  return { DMStatblocksPane: () => createElement('div', { className: 'atlas-dm-statblocks-section' }, createElement('div', { className: 'atlas-dm-statblocks-grid' })) };
});
vi.mock('../../src/app/react/components/dm-screen/useDMScreenStatblocks', () => ({ useDMScreenStatblocks: () => ({ statblocks: new Map(), loading: false }) }));

const SHOTS = '__screenshots__/sound-tab';

function box(selector: string): DOMRect {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element.getBoundingClientRect();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms); });

async function allReady(tab: SoundTab): Promise<void> {
  tab.director.shelf.request([...tab.records.values()]);
  await expect.poll(() => [...tab.records.values()].every((record) => tab.director.shelf.stateOf(record).state === 'ready'), { timeout: 60_000, interval: 100 }).toBe(true);
}

describe('the DM screen’s Sound page', () => {
  let viewport: HTMLElement;
  let tab: SoundTab | null = null;

  beforeEach(() => {
    viewport = document.body.createDiv();
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1280px; height: 820px; contain: strict; overflow: hidden';
  });

  afterEach(() => {
    tab?.unmount();
    tab = null;
    viewport.remove();
  });

  it('has the panel conventions, two panes at about 60 and 40, and the tab control', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(11);
    await sleep(350);

    const screen = box('.atlas-dm-screen');
    const close = box('.atlas-dm-screen-header .atlas-close-btn');
    const style = getComputedStyle(document.querySelector('.atlas-dm-screen')!);
    expect(style.borderRadius).toBe('24px');
    // The close button sits its gap from the border, above and beside, with a concentric corner.
    const border = parseFloat(style.borderTopWidth);
    expect(close.top - screen.top - border).toBeCloseTo(8, 0);
    expect(screen.right - close.right - border).toBeCloseTo(8, 0);
    // The panel's border is 1.5 px, which a screen of one pixel per point draws as 1.
    expect(parseFloat(getComputedStyle(document.querySelector('.atlas-dm-screen-header .atlas-close-btn')!).borderTopRightRadius)).toBeCloseTo(24 - 1.5 - 8, 1);

    const moods = box('.atlas-sound-moods');
    const now = box('.atlas-sound-now');
    expect(now.left).toBeGreaterThan(moods.right);
    expect(moods.width / (moods.width + now.width)).toBeCloseTo(0.6, 1);
    expect(now.bottom).toBeLessThanOrEqual(screen.bottom);

    const pages = box('.atlas-dm-screen-pages');
    expect(pages.top - screen.top).toBeLessThan(20);
    expect(document.querySelectorAll('.atlas-dm-screen-pages [role="radio"]')).toHaveLength(2);
    // Silence stays in the corner of its column.
    const silence = box('.atlas-sound-silence');
    expect(now.bottom - silence.bottom).toBeLessThan(12);
    expect(now.right - silence.right).toBeLessThan(12);
  });

  it('keeps the statblocks mounted and unmeasured while hidden, and the page in the UI slice', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    const content = document.querySelector<HTMLElement>('.atlas-dm-screen-content')!;
    expect(content.hidden).toBe(true);
    expect(getComputedStyle(content).display).toBe('none');
    expect(document.querySelector('.atlas-dm-statblocks-section')).not.toBeNull();
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-dm-screen-pages [role="radio"]')!);
    expect(tab.store.getState().dmScreenPage).toBe('statblocks');
    expect(getComputedStyle(content).display).toBe('flex');
    expect(getComputedStyle(document.querySelector('.atlas-dm-sound-page')!).display).toBe('none');
    const notes = box('.atlas-dm-notes-section');
    expect(notes.width).toBeGreaterThan(300);
  });

  it('leaves statblock feeds where they are while their page is hidden', async () => {
    await page.viewport(1280, 820);
    const { createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { StatblockFeeds } = await import('../../src/app/react/components/dm-screen/StatblockFeeds');
    tab = await openSoundTab(DARK, viewport);
    viewport.innerHTML = '';
    const pane = viewport.createDiv({ cls: 'atlas-dm-statblocks-grid' });
    pane.style.cssText = 'width: 1000px; height: 600px';
    const root = createRoot(pane);
    act(() => root.render(createElement(StatblockFeeds, null, [200, 300, 100, 250].map((height) => createElement('div', { key: height, style: { height } })))));
    const places = (): string[] => [...pane.querySelectorAll<HTMLElement>('.atlas-dm-statblock-feed-item')].map((item) => `${item.style.left} ${item.style.top} ${item.style.width}`);
    await expect.poll(() => pane.querySelector('[data-measured="true"]')).not.toBeNull();
    await sleep(100);
    const shown = places();
    expect(new Set(shown.map((place) => place.split(' ')[0])).size).toBeGreaterThan(1);
    pane.hidden = true;
    pane.style.display = 'none';
    await sleep(150);
    expect(places()).toEqual(shown);
    pane.hidden = false;
    pane.style.display = '';
    await sleep(150);
    expect(places()).toEqual(shown);
    act(() => root.unmount());
  });

  it('reaches every mood by keyboard alone, with Tab left to open and close the screen', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
    await allReady(tab);
    const ids = tab.moodsOf().map((mood) => mood.id);

    // From nothing focused: down enters the grid, and the arrows go round all of it.
    await userEvent.keyboard('{ArrowDown}');
    const reached = new Set<string>();
    const note = (): void => {
      const id = (document.activeElement as HTMLElement | null)?.closest('.atlas-sound-mood')?.querySelector<HTMLElement>('[data-sound-mood]')?.dataset.soundMood;
      if (id) reached.add(id);
    };
    note();
    for (let row = 0; row < 3; row++) {
      for (let step = 0; step < 3; step++) {
        await userEvent.keyboard('{ArrowRight}');
        note();
      }
      for (let step = 0; step < 3; step++) await userEvent.keyboard('{ArrowLeft}');
      await userEvent.keyboard('{ArrowDown}');
      note();
    }
    expect([...reached].sort()).toEqual([...ids].sort());

    // The menu of a mood opens from its keys, and moves it with Alt.
    const first = document.querySelector<HTMLElement>(`[data-sound-mood="${ids[0]}"]`)!;
    act(() => first.focus());
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();
    act(() => first.focus());
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await expect.poll(() => tab?.moodsOf().map((mood) => mood.id).slice(0, 2)).toEqual([ids[1], ids[0]]);
    act(() => document.querySelector<HTMLElement>(`[data-sound-mood="${ids[0]}"]`)?.focus());
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await expect.poll(() => tab?.moodsOf()[0]?.id).toBe(ids[0]);

    // Enter on a focused mood presses that one.
    const focused = document.querySelector<HTMLElement>(`[data-sound-mood="${ids[0]}"]`)!;
    act(() => focused.focus());
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => tab?.director.snapshot().mix.mood?.id).toBe(ids[0]);

    // Digits press moods wherever focus is, by their place; 0 is the tenth.
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('2');
    expect(tab.director.snapshot().mix.mood?.id).toBe(ids[1]);
    await userEvent.keyboard('0');
    expect(tab.director.snapshot().mix.mood?.id).toBe(ids[9]);
    // Enter with nothing focused is next; Backspace is Silence and brings back.
    await userEvent.keyboard('{Enter}');
    expect(tab.director.snapshot().mix.mood?.id).toBe(ids[10]);
    await userEvent.keyboard('{Backspace}');
    expect(tab.director.snapshot().mix.table.silenced).toBe(true);
    await userEvent.keyboard('{Backspace}');
    expect(tab.director.snapshot().mix.table.silenced).toBe(false);
    // Left and right with nothing focused change pages.
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab.store.getState().dmScreenPage).toBe('statblocks');
    await userEvent.keyboard('{ArrowRight}');
    expect(tab.store.getState().dmScreenPage).toBe('sound');
  });

  it('moves a mood by dragging, and a drag presses nothing', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
    const before = tab.moodsOf().map((mood) => mood.id);
    const first = page.elementLocator(document.querySelector(`[data-sound-mood="${before[0]}"]`)!);
    const third = page.elementLocator(document.querySelector(`[data-sound-mood="${before[2]}"]`)!);
    await userEvent.dragAndDrop(first, third);
    await expect.poll(() => tab?.moodsOf().map((mood) => mood.id)).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
    expect(tab.director.snapshot().mix.mood).toBeNull();
    // The press after a drag is a press again.
    await userEvent.click(document.querySelector<HTMLElement>(`[data-sound-mood="${before[1]}"]`)!);
    expect(tab.director.snapshot().mix.mood?.id).toBe(before[1]);
  });

  it('marks a sound that cannot play on its mood before anyone presses it', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await allReady(tab);
    const lost = tab.moodsOf().find((mood) => mood.name === 'Lost sound')!;
    await expect.poll(() => document.querySelector(`[data-sound-problem="${lost.id}"]`)?.textContent).toContain('1 not ready');
    const others = document.querySelectorAll('[data-sound-problem]');
    expect(others).toHaveLength(1);
  });

  it('draws what plays without rendering the page for it', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await allReady(tab);
    await userEvent.keyboard('1');
    await sleep(500);
    tab.commits.count = 0;
    const before = document.querySelector('.atlas-sound-position__time')?.textContent;
    await sleep(3000);
    expect(tab.commits.count, 'commits in 3 s of playing').toBeLessThan(6);
    expect(document.querySelector('.atlas-sound-position__time')?.textContent).not.toBe(before);
  });

  for (const [name, theme] of [['dark', DARK], ['light', LIGHT]] as const) {
    it(`shows moods playing in ${name}`, async () => {
      await page.viewport(1280, 820);
      tab = await openSoundTab(theme, viewport);
      seedMoods(tab);
      await allReady(tab);
      const { director } = tab;
      await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
      await userEvent.keyboard('1');
      await sleep(600);
      const rain = tab.records.get('Rain')!;
      director.desk.addSound(rain);
      const layer = director.snapshot().mix.table.layers[0];
      if (layer) director.desk.setLayerLevel(layer.sound.key, -12);
      await sleep(500);
      await page.screenshot({ path: `${SHOTS}/sound-${name}.png` });

      await userEvent.keyboard('{Backspace}');
      await sleep(400);
      await page.screenshot({ path: `${SHOTS}/sound-${name}-silenced.png` });
      await userEvent.keyboard('{Backspace}');

      act(() => document.querySelector<HTMLElement>('[data-sound-mood]')?.focus());
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
      await sleep(250);
      await page.screenshot({ path: `${SHOTS}/sound-${name}-menu.png` });
      expect(parseFloat(getComputedStyle(document.querySelector('[role="menu"]')!).zIndex || '0') || parseFloat(getComputedStyle(document.querySelector('[role="menu"]')!.parentElement!).zIndex)).toBeGreaterThan(1000);
      await userEvent.keyboard('{Escape}');

      await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-now__add')!);
      await sleep(250);
      await page.screenshot({ path: `${SHOTS}/sound-${name}-add.png` });

      await userEvent.click(document.querySelector<HTMLElement>('.atlas-dm-screen-pages [role="radio"]')!);
      await sleep(250);
      await page.screenshot({ path: `${SHOTS}/statblocks-${name}.png` });
      expect(COLLECTION).toBe('Fen');
    });
  }

  it('shows the empty page and a narrow view', async () => {
    tab = await openSoundTab(DARK, viewport);
    await page.viewport(1280, 820);
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/sound-empty.png` });
    viewport.style.width = '700px';
    seedMoods(tab);
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/sound-narrow.png` });
  });
});
