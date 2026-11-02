import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { MusicWave } from '@/app/react/components/dm-screen/sound/musicWave';
import type { PlayersCopy } from '@/app/soundDirector/tableClock';
import { PIN_ICON_PATHS } from '@/app/types/pinIcons';
import { DARK, LIGHT, openSoundTab, seedMoods, SOUNDS, type SoundTab } from './sound/soundTabHarness';

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

  /** `.atlas-dm-screen` fills this, with the moods laid out. */
  async function open1644(): Promise<void> {
    await page.viewport(1644, 960);
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1644px; height: 960px; contain: strict; overflow: hidden';
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(11);
    await act(async () => { await sleep(350); });
  }

  afterEach(() => {
    tab?.unmount();
    tab = null;
    viewport.remove();
  });

  it('says for a table online how each mood stands for players, and who hears', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await allReady(tab);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(11);
    let sending = true;
    const copies = new Map<string, PlayersCopy>();
    const listeners = new Set<() => void>();
    const prepared: unknown[] = [];
    await act(async () => {
      tab?.director.players.use({
        copyOf: (record) => copies.get(record.name) ?? { state: 'ready' },
        prepare: (sounds) => void prepared.push(sounds ?? 'all moods'),
        get sending() { return sending; },
        setSending: (on) => {
          sending = on;
          for (const listener of listeners) listener();
        },
        onChange: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
      });
      tab?.director.useAudience({ line: () => '3 of 5 hearing · 2 tracks still uploading', onChange: () => () => undefined });
      await sleep(0);
    });
    copies.set('Rain', { state: 'uploading', share: 0.4 });
    copies.set('Road to Wolfhaven', { state: 'nowhere' });
    await act(async () => {
      for (const listener of listeners) listener();
      await sleep(0);
    });
    const tags = [...document.querySelectorAll<HTMLElement>('.atlas-sound-tag--players')].map((tag) => tag.dataset.players);
    expect(tags).toContain('uploading');
    expect(tags).toContain('nowhere');
    expect(tags).toContain('ready');
    expect(document.querySelector('.atlas-sound-who')?.textContent).toBe('3 of 5 hearing · 2 tracks still uploading');
    expect(document.querySelector('.atlas-sound-output')?.textContent).toBe('System output');
    for (const mood of document.querySelectorAll('.atlas-sound-mood')) {
      const inner = mood.querySelector('.atlas-sound-tag--players')?.getBoundingClientRect();
      if (inner) {
        expect(inner.right).toBeLessThanOrEqual(mood.getBoundingClientRect().right);
        expect(inner.bottom).toBeLessThanOrEqual(mood.getBoundingClientRect().bottom);
      }
    }
    await page.screenshot({ path: `${SHOTS}/players-dark.png` });
    const menuItem = async (text: string): Promise<HTMLElement> => {
      await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-who')!);
      await expect.poll(() => [...document.querySelectorAll('[role^="menuitem"]')].find((item) => item.textContent?.includes(text))).toBeDefined();
      return [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((item) => item.textContent?.includes(text))!;
    };
    await userEvent.click(await menuItem('Prepare for players'));
    expect(prepared).toEqual(['all moods']);
    await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();
    await userEvent.click(await menuItem('Send sound to players'));
    expect(sending).toBe(false);
    await expect.poll(() => document.querySelector('.atlas-sound-tag--players')).toBeNull();
    expect(document.querySelector('.atlas-sound-who')?.textContent).toBe('Not sent to players');
    await act(async () => {
      tab?.director.players.use(null);
      await sleep(0);
    });
    expect(document.querySelector('button.atlas-sound-who')).toBeNull();
  });

  it('stands on the backdrop: one surface, the library beside the moods over a desk of a fixed height', async () => {
    await open1644();
    const screen = box('.atlas-dm-screen');
    expect(screen.width).toBeCloseTo(1644, -1);
    expect(screen.height).toBeCloseTo(960, -1);
    expect(getComputedStyle(document.querySelector('.atlas-dm-screen')!).backgroundColor).toBe('rgba(0, 0, 0, 0)');

    // The top row one inset from the view's edges, and the surface below it.
    const pages = box('.atlas-dm-screen-pages');
    const surface = box('.atlas-sound-pane');
    expect(pages.top - screen.top).toBeCloseTo(pages.left - screen.left, 0);
    expect(surface.top).toBeGreaterThanOrEqual(pages.bottom);
    expect(document.querySelectorAll('.atlas-sound-views, .atlas-sound-pane [role="radiogroup"]')).toHaveLength(0);
    expect(parseFloat(getComputedStyle(document.querySelector('.atlas-sound-pane')!).borderRadius)).toBe(24);
    expect(document.querySelectorAll('.atlas-dm-screen-pages [role="radio"]')).toHaveLength(2);

    // The library takes about 58 % and the moods the rest, parted by the moods' hairline, on one line.
    const library = box('.atlas-sound-lib');
    const moods = box('.atlas-sound-moods');
    expect(library.width / surface.width).toBeCloseTo(0.58, 1);
    expect(moods.width / surface.width).toBeCloseTo(0.42, 1);
    expect(moods.left).toBeCloseTo(library.right, 0);
    expect(moods.top).toBe(library.top);
    expect(moods.bottom).toBe(library.bottom);
    expect(getComputedStyle(document.querySelector('.atlas-sound-moods')!).boxShadow).toContain('inset');

    // Three across, all one height, the ghost in the next free place.
    const tiles = [...document.querySelectorAll('.atlas-sound-mood')].map((tile) => tile.getBoundingClientRect());
    expect(new Set(tiles.map((tile) => Math.round(tile.height)))).toEqual(new Set([116]));
    expect(tiles.filter((tile) => tile.top === tiles[0]?.top)).toHaveLength(3);
    const ghost = box('.atlas-sound-ghost');
    expect(ghost.top).toBe(tiles[10]?.top);
    expect(ghost.left).toBeGreaterThan(tiles[10]?.right ?? Infinity);

    // The desk is its height, at the surface's foot.
    const desk = box('.atlas-sound-desk');
    expect(desk.height).toBe(336);
    expect(surface.bottom - desk.bottom).toBeLessThan(2);
    expect(box('.atlas-sound-stage').bottom).toBeCloseTo(desk.top, 0);
    expect(document.querySelector('.atlas-sound-master, .atlas-sound-silence')).toBeNull();
  });

  it('lines the strips up on one baseline, keeps Silence in place across moods, and overflows no text', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    const places = new Set<string>();
    for (const key of ['1', '8', '3', '2']) {
      await userEvent.keyboard(key);
      await expect.poll(() => document.querySelector('.atlas-sound-silence')).not.toBeNull();
      await act(async () => { await sleep(400); });
      const silence = box('.atlas-sound-silence');
      places.add(`${silence.left} ${silence.top} ${silence.width} ${silence.height}`);
      const master = box('.atlas-sound-strip--master');
      expect(master.right).toBeLessThan(silence.left);
      expect(new Set([...document.querySelectorAll('.atlas-sound-meter')].map((meter) => { const { top, bottom } = meter.getBoundingClientRect(); return `${top} ${bottom}`; })).size).toBe(1);
      const values = [...document.querySelectorAll('.atlas-sound-fader__value')].map((value) => value.getBoundingClientRect().top);
      expect(new Set(values).size).toBe(1);
      for (const element of document.querySelectorAll<HTMLElement>('.atlas-sound-mood__name, .atlas-sound-strip, .atlas-sound-music__body, .atlas-sound-desk__head')) {
        const isName = element.classList.contains('atlas-sound-mood__name');
        if (!isName) expect(element.scrollWidth, element.className).toBeLessThanOrEqual(element.clientWidth);
      }
    }
    expect(places.size).toBe(1);
    expect(box('.atlas-sound-strip:not(.atlas-sound-strip--music):not(.atlas-sound-strip--master)').width).toBe(104);
    expect(box('.atlas-sound-strip--master').width).toBe(96);
  });

  it('fits eight layers at this width; where they do not fit, they scroll and Master and Silence stay', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    const { director, records } = tab;
    await userEvent.keyboard('8');
    for (const [name, { kind }] of Object.entries(SOUNDS)) {
      const record = records.get(name);
      if (kind === 'ambience' && record) act(() => { director.desk.addSound(record); });
    }
    await expect.poll(() => document.querySelectorAll('.atlas-sound-strip[data-muted], .atlas-sound-strips__mix .atlas-sound-strip:not(.atlas-sound-strip--music)').length).toBe(8);
    expect(document.querySelector('.atlas-sound-ambience-tile')).toBeNull();
    const row = document.querySelector<HTMLElement>('.atlas-sound-strips__mix')!;
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    const silence = box('.atlas-sound-silence');

    // A window of the mockup's own size, where the screen takes 96 % of it, fits them as well.
    viewport.style.width = '1644px';
    await act(async () => { await sleep(100); });
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);

    viewport.style.width = '1200px';
    await act(async () => { await sleep(100); });
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    expect(box('.atlas-sound-silence').right).toBeCloseTo(box('.atlas-sound-strips').right - 16, 0);
    expect(box('.atlas-sound-strip--master').right).toBeLessThan(box('.atlas-sound-silence').left);
    // A scrollbar takes no height from a fader.
    expect(box('.atlas-sound-silence').height).toBe(silence.height);
  });

  it('shows the empty page: no moods yet, Choose music, Ambience and the output, and no Master or Silence', async () => {
    await page.viewport(1644, 960);
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1644px; height: 960px; contain: strict; overflow: hidden';
    tab = await openSoundTab(DARK, viewport);
    await act(async () => { await sleep(100); });
    expect(document.querySelector('.atlas-sound-no-moods h2')?.textContent).toBe('No moods yet');
    expect(document.querySelectorAll('.atlas-sound-no-moods p')).toHaveLength(1);
    expect(document.querySelector('.atlas-sound-lib__nolink h2')?.textContent).toBe('Where is your music?');
    expect(box('.atlas-sound-lib__nolink h2').top).toBe(box('.atlas-sound-no-moods h2').top);
    expect(document.querySelector('.atlas-sound-pick')?.textContent).toBe('Choose music');
    expect(document.querySelector('.atlas-sound-ambience-tile')?.textContent).toBe('Ambience');
    expect(document.querySelector('.atlas-sound-output')?.textContent).toBe('System output');
    expect(document.querySelector('.atlas-sound-desk__head')?.textContent).toContain('Nothing playing');
    expect(document.querySelector('.atlas-sound-strip--master')).toBeNull();
    expect(document.querySelector('.atlas-sound-silence')).toBeNull();
    expect(document.querySelector('.atlas-sound-ghost')).toBeNull();

    // Both take focus to the library, at the root each belongs to.
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-ambience-tile')!);
    expect(tab.store.getState().soundLibraryRoot).toBe('ambience');
    expect(document.activeElement?.closest('.atlas-sound-lib')).not.toBeNull();
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-pick')!);
    expect(tab.store.getState().soundLibraryRoot).toBe('music');
    expect(document.activeElement?.closest('.atlas-sound-lib')).not.toBeNull();
    expect(box('.atlas-sound-desk').height).toBe(336);
  });

  it('holds fewer columns at 1280, and below the breakpoint stacks the library over the moods, each with its share', async () => {
    await open1644();
    const columns = (): number => { const first = box('.atlas-sound-mood'); return [...document.querySelectorAll('.atlas-sound-mood')].filter((tile) => tile.getBoundingClientRect().top === first.top).length; };
    expect(columns()).toBe(3);
    viewport.style.width = '1280px';
    await act(async () => { await sleep(50); });
    expect(columns()).toBe(2);
    const surface = box('.atlas-sound-pane');
    expect(box('.atlas-sound-lib').width / surface.width).toBeCloseTo(0.58, 1);
    expect(box('.atlas-sound-moods').left).toBeCloseTo(box('.atlas-sound-lib').right, 0);
    viewport.style.width = '700px';
    await act(async () => { await sleep(50); });
    const library = box('.atlas-sound-lib');
    const moods = box('.atlas-sound-moods');
    expect(moods.top).toBeCloseTo(library.bottom, 0);
    expect(moods.left).toBe(library.left);
    expect(library.height / (library.height + moods.height)).toBeCloseTo(0.58, 1);
    expect(moods.height).toBeGreaterThan(100);
    expect(document.querySelectorAll('.atlas-sound-pane [role="tab"], .atlas-sound-pane [role="radiogroup"]')).toHaveLength(0);
    expect(box('.atlas-sound-desk').height).toBeLessThan(336);
  });

  it('moves a fader by key and by drag, announces it, and leaves it with left and right', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    await userEvent.keyboard('1');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-strips__mix [role="slider"]').length).toBe(3);
    const layerKey = (): number => tab?.director.snapshot().mix.table.layers[0]?.gainDb ?? NaN;
    const thumb = document.querySelectorAll<HTMLElement>('.atlas-sound-strips__mix [role="slider"]')[1]!;
    const before = layerKey();
    act(() => thumb.focus());
    await userEvent.keyboard('{ArrowUp}');
    expect(layerKey()).toBe(before + 1);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(layerKey()).toBe(before - 1);
    expect(thumb.getAttribute('aria-valuetext')).toBe(`\u2212${Math.abs(before - 1)} dB`);
    expect(thumb.getAttribute('aria-orientation')).toBe('vertical');
    expect(thumb.getAttribute('title')).toBeNull();
    expect(tab.store.getState().dmScreenPage).toBe('sound');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).not.toBe(thumb);
    await expect.poll(() => document.activeElement?.closest('.atlas-sound-desk')).not.toBeNull();

    // A press on the track puts the thumb there; the release leaves it there.
    const track = thumb.closest<HTMLElement>('.atlas-sound-fader')!;
    const { width, height } = track.getBoundingClientRect();
    await userEvent.dragAndDrop(page.elementLocator(thumb), page.elementLocator(track), { targetPosition: { x: width / 2, y: height * 0.75 } });
    await expect.poll(layerKey).toBeCloseTo(6 - 0.75 * 66, -1);
  });

  it('says changed once the mix differs, saves to the mood, and offers clearing it in a menu', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    await userEvent.keyboard('1');
    await expect.poll(() => document.querySelector('.atlas-sound-desk__mix')?.textContent).toBe('Tavern at night');
    const head = (): string => document.querySelector('.atlas-sound-desk__head')?.textContent ?? '';
    await act(async () => { await sleep(50); });
    expect(head()).not.toContain('changed');
    expect(head()).not.toContain('Save to mood');
    expect(head()).toContain('Save as new mood');
    const layer = tab.director.snapshot().mix.table.layers[0];
    act(() => tab?.director.desk.setLayerLevel(layer?.sound.key ?? '', -20));
    await expect.poll(head).toContain('changed');
    await userEvent.click([...document.querySelectorAll<HTMLElement>('.atlas-sound-desk__head button')].find((button) => button.textContent === 'Save to mood')!);
    await expect.poll(head).not.toContain('changed');
    expect(tab.moodsOf()[0]?.layers.some((saved) => saved.levelDb === -20)).toBe(true);

    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-desk__head .atlas-sound-icon')!);
    await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    const clear = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes('Clear the mix'))!;
    await userEvent.click(clear);
    await expect.poll(() => tab?.director.snapshot().mix.table.layers.length).toBe(0);
    await expect.poll(() => document.querySelector('.atlas-sound-silence')).toBeNull();
  });

  it('draws a plain line for a track without peaks yet, and the bars of its peaks once they are here', () => {
    const host = document.body.createDiv();
    host.style.cssText = 'position: absolute; width: 300px; height: 62px; color: #fff';
    const canvas = host.createEl('canvas');
    canvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%';
    const played = canvas.cloneNode() as HTMLCanvasElement;
    host.append(played);
    const wave = new MusicWave(canvas, played);
    const rows = (): number[] => {
      const { data, height, width } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      const inked: number[] = [];
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let x = 0; x < width; x++) sum += data[(y * width + x) * 4 + 3] ?? 0;
        if (sum > 0) inked.push(y);
      }
      return inked;
    };
    wave.show(null, 0.5);
    const scale = window.devicePixelRatio;
    expect(rows().length).toBeLessThanOrEqual(Math.ceil(scale) + 1);
    wave.show(new Uint8Array(400).fill(255), 0.5);
    expect(rows().length).toBe(canvas.height);
    expect(played.style.clipPath).toContain('calc(100% - 150px)');
    host.remove();
  });

  it('opens the mood dialog with a crest and a tone it can save', async () => {
    await open1644();
    if (!tab) return;
    const first = tab.moodsOf()[0];
    act(() => document.querySelector<HTMLElement>('[data-sound-mood]')?.focus());
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    await userEvent.click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Edit')!);
    await expect.poll(() => document.querySelector('.atlas-sound-dialog')).not.toBeNull();
    await userEvent.click(document.querySelectorAll<HTMLElement>('.atlas-sound-look__tone')[6]!);
    await userEvent.click(document.querySelectorAll<HTMLElement>('.atlas-sound-look__crest')[2]!);
    expect(document.querySelector('.atlas-sound-look__crest[aria-checked="true"]')).toBe(document.querySelectorAll('.atlas-sound-look__crest')[2]);
    await userEvent.click([...document.querySelectorAll<HTMLElement>('.atlas-sound-dialog button')].find((button) => button.textContent === 'Save')!);
    await expect.poll(() => tab?.moodsOf().find((mood) => mood.id === first?.id)?.tone).toBe('azure');
    expect(tab.moodsOf().find((mood) => mood.id === first?.id)?.icon).toBe('treasure');
    expect(document.querySelector('.atlas-sound-mood svg path')?.getAttribute('d')).toBe(PIN_ICON_PATHS.treasure);
  });

  it('runs a thin bar along the tile for the crossfade, and meters from real levels while the page shows', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    const opened = vi.spyOn(tab.director, 'openMeters');
    await userEvent.keyboard('1');
    await expect.poll(() => document.querySelector('.atlas-sound-mood[data-playing]')).not.toBeNull();
    expect(document.querySelector('.atlas-sound-mood[data-playing] .atlas-sound-mood__fade')?.getAnimations()).toHaveLength(1);
    await expect.poll(() => opened.mock.calls.length).toBe(1);
    const scales = (): number[] => [...document.querySelectorAll<HTMLElement>('.atlas-sound-meter i')].map((fill) => new DOMMatrix(getComputedStyle(fill).transform).d);
    await expect.poll(() => Math.max(...scales()), { timeout: 5000 }).toBeGreaterThan(0.2);
    const levels = new Map<string, number>();
    tab.director.readMeters(levels);
    expect(levels.has('master')).toBe(true);

    // Leaving the page gives the analysers back, and silences the reading.
    act(() => tab?.store.getState().setDMScreenPage('statblocks'));
    await expect.poll(() => { tab?.director.readMeters(levels); return levels.size; }).toBe(0);
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
    for (let row = 0; row < 6; row++) {
      await userEvent.keyboard('{ArrowRight}');
      note();
      await userEvent.keyboard('{ArrowLeft}');
      await userEvent.keyboard('{ArrowDown}');
      note();
    }
    expect([...reached].sort()).toEqual([...ids].sort());

    // Left of the moods lies the library, and its keys lead back.
    act(() => document.querySelector<HTMLElement>(`[data-sound-mood="${ids[0]}"]`)?.focus());
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement?.closest('.atlas-sound-lib')).not.toBeNull();

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

    // Digits press moods wherever focus is, by their place; 0 is the tenth. No key of the tab goes on to the map's listeners.
    (document.activeElement as HTMLElement | null)?.blur();
    const reachedMap: string[] = [];
    const mapListener = (event: KeyboardEvent): void => { reachedMap.push(event.key); };
    window.addEventListener('keydown', mapListener);
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
    window.removeEventListener('keydown', mapListener);
    expect(reachedMap).toEqual([]);
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
    const before = document.querySelector('.atlas-sound-music__time')?.textContent;
    const meter = document.querySelector<HTMLElement>('.atlas-sound-strip--master .atlas-sound-meter i')!;
    const drawn = new Set<string>();
    const watch = window.setInterval(() => drawn.add(meter.style.transform), 50);
    await sleep(3000);
    window.clearInterval(watch);
    expect(tab.commits.count, 'commits in 3 s of playing').toBeLessThan(6);
    expect(drawn.size, 'the meter moved all the while').toBeGreaterThan(1);
    expect(document.querySelector('.atlas-sound-music__time')?.textContent).not.toBe(before);
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

      await userEvent.click(document.querySelector<HTMLElement>('.atlas-dm-screen-pages [role="radio"]')!);
      await sleep(250);
      await page.screenshot({ path: `${SHOTS}/statblocks-${name}.png` });
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
