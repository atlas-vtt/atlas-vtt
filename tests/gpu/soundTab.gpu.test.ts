import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { MusicWave } from '@/app/react/components/dm-screen/sound/musicWave';
import { musicPosition, soundingMusic } from '@/app/soundDirector/musicList';
import type { PlayersCopy } from '@/app/soundDirector/tableClock';
import { MOOD_CREST_PATHS } from '@/app/types/moodCrestPaths';
import sceneThumb from '../fixtures/images/baseline-444.jpg?url';
import { centreOf, mouse, pressAndMove } from './realMouse';
import { DARK, LIGHT, openSoundTab, seedMoods, SOUNDS, type SoundTab } from './sound/soundTabHarness';
import { faderDb } from '@/app/react/components/dm-screen/sound/faderScale';

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

  it('turns a strip\'s reverb with its knob, and changes the space from the desk and the mood', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    await userEvent.keyboard('1');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-strips .atlas-sound-knob').length).toBeGreaterThan(0);
    const key = tab.director.snapshot().mix.table.layers[0]!.sound.key;
    const reverbOf = (): number | undefined => tab?.director.snapshot().mix.table.layers.find((layer) => layer.sound.key === key)?.reverb;
    const name = tab.director.shelf.recordOfKey(key)?.name ?? '';
    const knob = document.querySelector<HTMLElement>(`.atlas-sound-knob[aria-label="Space of ${name}"]`)!;
    expect(knob.getAttribute('aria-valuetext')).toMatch(/, 0 %$/);
    const { width, height } = knob.getBoundingClientRect();
    expect([width, height]).toEqual([32, 32]);
    // Every strip's fader starts at the same height, with a knob or without.
    const tops = new Set([...document.querySelectorAll('.atlas-sound-strip .atlas-sound-fader')].map((fader) => Math.round(fader.getBoundingClientRect().top)));
    expect(tops.size).toBe(1);

    const from = centreOf(knob);
    await pressAndMove(from, { x: from.x, y: from.y - 80 });
    await mouse.up(from.x, from.y - 80);
    await expect.poll(reverbOf).toBeCloseTo(0.5, 1);
    expect(knob.dataset.wet).toBe('true');
    expect(knob.querySelector('.atlas-sound-knob__value')?.textContent).toBe(`${Math.round((reverbOf() ?? 0) * 100)}`);
    act(() => knob.focus());
    await userEvent.keyboard('{ArrowUp}');
    await expect.poll(reverbOf).toBeCloseTo(0.55, 2);
    await userEvent.unhover(knob);
    await page.screenshot({ path: `${SHOTS}/reverb-knobs.png`, element: document.querySelector<HTMLElement>('.atlas-sound-desk')! });
    await userEvent.dblClick(knob);
    await expect.poll(reverbOf).toBeUndefined();

    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-room')!);
    const cave = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((item) => item.textContent?.includes('Cave'));
    await expect.poll(cave).toBeDefined();
    await userEvent.click(cave()!);
    await expect.poll(() => tab?.director.snapshot().mix.table.room?.id).toBe('cave');
    expect(document.querySelector('.atlas-sound-room')?.textContent).toBe('Cave');
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
      tab?.director.useAudience({ line: () => '3 of 5 hearing · 2 tracks still uploading', detail: () => 'Hearing: Kara.', onChange: () => () => undefined });
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
    // Ready is no news: a mood whose sounds all reached the store shows no tag.
    expect(tags).not.toContain('ready');
    expect(tags.length).toBeLessThan(document.querySelectorAll('.atlas-sound-mood').length);
    expect(document.querySelector('.atlas-sound-who')?.textContent).toBe('3 of 5 hearing · 2 tracks still uploading');
    // Who those are, by name, under the pointer.
    await userEvent.hover(document.querySelector<HTMLElement>('.atlas-sound-who')!);
    await expect.poll(() => document.querySelector('[role="tooltip"]')?.textContent).toBe('Hearing: Kara.');
    await userEvent.unhover(document.querySelector<HTMLElement>('.atlas-sound-who')!);
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
    await userEvent.click(await menuItem('Store all moods for players now'));
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

    // The page control centred near the top, and the surface below it.
    const pages = box('.atlas-dm-screen-pages');
    const surface = box('.atlas-sound-pane');
    expect(pages.top - screen.top).toBeCloseTo(16, 0);
    expect((pages.left + pages.right) / 2).toBeCloseTo((screen.left + screen.right) / 2, 0);
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

    // Three across, all one height, under the region's heading that holds New mood.
    const tiles = [...document.querySelectorAll('.atlas-sound-mood')].map((tile) => tile.getBoundingClientRect());
    expect(new Set(tiles.map((tile) => Math.round(tile.height)))).toEqual(new Set([104]));
    expect(tiles.filter((tile) => tile.top === tiles[0]?.top)).toHaveLength(3);
    const head = box('.atlas-sound-moods__head');
    expect(head.bottom).toBeLessThanOrEqual(tiles[0]?.top ?? 0);
    expect(document.querySelector('.atlas-sound-moods__head')?.textContent).toContain('New mood');

    // The desk is its height, at the surface's foot.
    const desk = box('.atlas-sound-desk');
    expect(desk.height).toBe(336);
    expect(surface.bottom - desk.bottom).toBeLessThan(2);
    expect(box('.atlas-sound-stage').bottom).toBeCloseTo(desk.top, 0);
    expect(document.querySelector('.atlas-sound-master, .atlas-sound-stop-all')).toBeNull();
  });

  it('lines the strips up on one baseline, keeps Stop all in place across moods, and overflows no text', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    const places = new Set<string>();
    for (const key of ['1', '8', '3', '2']) {
      await userEvent.keyboard(key);
      await expect.poll(() => document.querySelector('.atlas-sound-stop-all')).not.toBeNull();
      await act(async () => { await sleep(400); });
      const silence = box('.atlas-sound-stop-all');
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

  it('fits eight layers at this width; where they do not fit, they scroll and Master and Stop all stay', async () => {
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
    const row = document.querySelector<HTMLElement>('.atlas-sound-strips__mix')!;
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    const silence = box('.atlas-sound-stop-all');

    // A window of the mockup's own size, where the screen takes 96 % of it, fits them as well.
    viewport.style.width = '1644px';
    await act(async () => { await sleep(100); });
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);

    viewport.style.width = '1200px';
    await act(async () => { await sleep(100); });
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    expect(box('.atlas-sound-stop-all').right).toBeCloseTo(box('.atlas-sound-strips').right, 0);
    expect(box('.atlas-sound-strip--master').right).toBeLessThan(box('.atlas-sound-stop-all').left);
    // A scrollbar takes no height from a fader.
    expect(box('.atlas-sound-stop-all').height).toBe(silence.height);
  });

  it('shows the empty page: no moods yet, the output, and no strips, Master or Stop all', async () => {
    await page.viewport(1644, 960);
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1644px; height: 960px; contain: strict; overflow: hidden';
    tab = await openSoundTab(DARK, viewport);
    await act(async () => { await sleep(100); });
    expect(document.querySelector('.atlas-sound-no-moods h2')?.textContent).toBe('No moods yet');
    expect(document.querySelectorAll('.atlas-sound-no-moods p')).toHaveLength(1);
    expect(document.querySelector('.atlas-sound-lib__nolink h2')?.textContent).toBe('Where is your music?');
    expect(box('.atlas-sound-lib__nolink h2').top).toBe(box('.atlas-sound-no-moods h2').top);
    expect(document.querySelector('.atlas-sound-strips__mix')?.childElementCount).toBe(0);
    expect(document.querySelector('.atlas-sound-output')?.textContent).toBe('System output');
    expect(document.querySelector('.atlas-sound-desk__head')?.textContent).toContain('Nothing playing');
    expect(document.querySelector('.atlas-sound-strip--master')).toBeNull();
    expect(document.querySelector('.atlas-sound-stop-all')).toBeNull();
    expect(document.querySelector('.atlas-sound-moods__head')).toBeNull();
    await expect.poll(() => box('.atlas-sound-desk').height).toBe(336);
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

  it('moves a fader by key and by drag, announces it, and takes left and right for the pages', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    await userEvent.keyboard('1');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-strips__mix .atlas-sound-fader [role="slider"]').length).toBe(3);
    const layerKey = (): number => tab?.director.snapshot().mix.table.layers[0]?.gainDb ?? NaN;
    const thumb = document.querySelectorAll<HTMLElement>('.atlas-sound-strips__mix .atlas-sound-fader [role="slider"]')[1]!;
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
    // Left and right change the DM screen's page, wherever focus is on this page.
    await userEvent.keyboard('{ArrowRight}');
    expect(tab.store.getState().dmScreenPage).toBe('statblocks');
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab.store.getState().dmScreenPage).toBe('sound');

    // A press on the track puts the thumb there; the release leaves it there.
    const track = thumb.closest<HTMLElement>('.atlas-sound-fader')!;
    const { width, height } = track.getBoundingClientRect();
    await userEvent.dragAndDrop(page.elementLocator(thumb), page.elementLocator(track), { targetPosition: { x: width / 2, y: height * 0.75 } });
    // On the desk's scale (`faderScale`): a quarter up the rail is about −31 dB.
    await expect.poll(layerKey).toBeCloseTo(faderDb(0.25), -1);

    // Reset shows on the strip's hover, takes the level back, and has nothing to do at 0 dB.
    const strip = thumb.closest<HTMLElement>('.atlas-sound-strip')!;
    const reset = strip.querySelector<HTMLButtonElement>('.atlas-sound-fader__reset')!;
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await userEvent.unhover(strip);
    await expect.poll(() => getComputedStyle(reset).opacity).toBe('0');
    await userEvent.hover(strip);
    await expect.poll(() => getComputedStyle(reset).opacity).toBe('1');
    await page.screenshot({ path: `${SHOTS}/fader-reset.png`, element: strip });
    await userEvent.click(reset);
    await expect.poll(layerKey).toBe(0);
    expect(reset.disabled).toBe(true);
    expect(thumb.getAttribute('aria-valuetext')).toBe('0 dB');

    // What waits for the pointer shows when it comes: a layer's remove, the track list, a mood's menu.
    await expect.poll(() => getComputedStyle(strip.querySelector('.atlas-sound-strip__remove')!).opacity).toBe('1');
    const card = document.querySelector<HTMLElement>('.atlas-sound-music')!;
    await userEvent.hover(card);
    await expect.poll(() => getComputedStyle(card.querySelector('.atlas-sound-music__list')!).opacity).toBe('1');
    const tile = document.querySelector<HTMLElement>('.atlas-sound-mood')!;
    await userEvent.hover(tile);
    await expect.poll(() => getComputedStyle(tile.querySelector('.atlas-sound-mood__menu')!).opacity).toBe('1');

    // Master's goes on to the settings as its release does.
    const master = document.querySelector<HTMLElement>('.atlas-sound-strip--master')!;
    act(() => tab?.director.setChannelLevels({ masterDb: -9 }, false));
    await userEvent.hover(master);
    await userEvent.click(master.querySelector<HTMLElement>('.atlas-sound-fader__reset')!);
    await expect.poll(() => tab?.director.snapshot().levels.masterDb).toBe(0);
  });

  describe('a list moved by hand', () => {
    const NAMES = ['Long road', 'Grey miles', 'Drowned chapel', 'Steel', 'Embers'];
    const LIST_SOUNDS = Object.fromEntries(NAMES.map((name, index) => [name, { synth: { seconds: index === 0 ? 70 : 3, seed: index + 1 }, kind: 'music' as const }]));
    const rows = (): string[] => [...document.querySelectorAll('.atlas-sound-queue > .atlas-sound-tracks:first-of-type .atlas-sound-track__name')].map((row) => row.textContent ?? '');
    const row = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('.atlas-sound-queue .atlas-sound-track')].find((one) => one.textContent?.includes(name))!;

    async function openList(): Promise<SoundTab> {
      await page.viewport(1644, 960);
      viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1644px; height: 960px; contain: strict; overflow: hidden';
      const opened = await openSoundTab(DARK, viewport, undefined, LIST_SOUNDS);
      tab = opened;
      await allReady(opened);
      // The first is 70 s, so the list stands still while this moves it.
      act(() => opened.director.desk.playList(NAMES.flatMap((name) => opened.records.get(name) ?? []), false));
      await expect.poll(() => document.querySelector('.atlas-sound-music__list')).not.toBeNull();
      await userEvent.hover(document.querySelector<HTMLElement>('.atlas-sound-music')!);
      await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-music__list')!);
      await expect.poll(rows).toEqual(NAMES);
      return opened;
    }

    async function pressHandle(name: string): Promise<{ x: number; y: number }> {
      const at = centreOf(row(name));
      await mouse.hover(at.x, at.y);
      await act(async () => { await sleep(150); });
      return centreOf(row(name).querySelector('.atlas-sound-track__grip')!);
    }

    it('moves with a real drag, Escape, a lost pointer and a blur put it back, and what sounds is left alone', async () => {
      const opened = await openList();
      const before = opened.director.snapshot().mix.table;
      const fromRow = (name: string): { x: number; y: number } => ({ x: centreOf(row('Long road')).x, y: centreOf(row(name)).y });

      // Under the threshold it is no drag.
      const handle = await pressHandle('Grey miles');
      await mouse.down(handle.x, handle.y);
      await mouse.move(handle.x, handle.y + 2);
      await mouse.up(handle.x, handle.y + 2);
      expect(rows()).toEqual(NAMES);
      expect(opened.director.snapshot().mix.listChange).toBeNull();

      // Escape puts it back, and the release after it does nothing.
      await pressAndMove(await pressHandle('Grey miles'), fromRow('Steel'), 8);
      await expect.poll(() => rows().indexOf('Grey miles')).toBeGreaterThan(1);
      expect(document.querySelector('.atlas-sound-track[data-dragging]')?.textContent).toContain('Grey miles');
      await userEvent.keyboard('{Escape}');
      await expect.poll(rows).toEqual(NAMES);
      await mouse.up(fromRow('Steel').x, fromRow('Steel').y);
      expect(opened.director.snapshot().mix.listChange).toBeNull();

      // The window losing focus puts it back too.
      await pressAndMove(await pressHandle('Grey miles'), fromRow('Steel'), 8);
      await expect.poll(() => rows().indexOf('Grey miles')).toBeGreaterThan(1);
      act(() => { window.dispatchEvent(new Event('blur')); });
      await expect.poll(rows).toEqual(NAMES);
      await mouse.up(fromRow('Steel').x, fromRow('Steel').y);

      // A drag shows at once, in the list and in Then, and the state waits for the track's end.
      await pressAndMove(await pressHandle('Grey miles'), fromRow('Steel'), 8);
      await mouse.up(fromRow('Steel').x, fromRow('Steel').y);
      await expect.poll(rows).toEqual(['Long road', 'Drowned chapel', 'Steel', 'Grey miles', 'Embers']);
      const { mix } = opened.director.snapshot();
      expect(mix.table).toBe(before);
      expect(mix.listChange).not.toBeNull();
      await expect.poll(() => document.querySelector('.atlas-sound-music__next')?.textContent).toBe('Then Drowned chapel');
      expect(row('Long road').getAttribute('aria-current')).toBe('true');

      // Alt with up and down, from the row's own button; focus stays on it.
      const play = row('Embers').querySelector<HTMLElement>('button:not(.atlas-sound-track__grip):not(.atlas-sound-track__remove)')!;
      act(() => play.focus());
      await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
      await expect.poll(rows).toEqual(['Long road', 'Drowned chapel', 'Steel', 'Embers', 'Grey miles']);
      expect(document.activeElement).toBe(play);
      await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
      await expect.poll(rows).toEqual(['Long road', 'Drowned chapel', 'Steel', 'Grey miles', 'Embers']);
      expect(document.activeElement).toBe(play);
      expect(opened.director.snapshot().mix.table).toBe(before);

      // Without a drag: the row's menu moves it up and down, and is the first row's way to say it cannot go up.
      const menuItem = async (text: string): Promise<HTMLElement> => {
        await expect.poll(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.startsWith(text))).toBeDefined();
        return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.startsWith(text))!;
      };
      await userEvent.hover(row('Embers'));
      await userEvent.click(row('Embers').querySelector<HTMLElement>('.atlas-sound-track__menu')!);
      await userEvent.click(await menuItem('Move up'));
      await expect.poll(rows).toEqual(['Long road', 'Drowned chapel', 'Steel', 'Embers', 'Grey miles']);
      // Shift+F10 on a focused row opens the same menu.
      act(() => row('Embers').querySelector<HTMLElement>('.atlas-sound-track__menu')!.focus());
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      await userEvent.click(await menuItem('Move down'));
      await expect.poll(rows).toEqual(['Long road', 'Drowned chapel', 'Steel', 'Grey miles', 'Embers']);
      await userEvent.click(row('Long road').querySelector<HTMLElement>('.atlas-sound-track__menu')!);
      expect((await menuItem('Move up')).getAttribute('aria-disabled')).toBe('true');
      await userEvent.keyboard('{Escape}');
      expect(opened.director.snapshot().mix.table).toBe(before);

      // The waveform stays above the open list, and a press on it still moves the track.
      const wave = document.querySelector<HTMLElement>('.atlas-sound-music__wave')!;
      const { left, top, width, height } = wave.getBoundingClientRect();
      expect(height).toBeGreaterThan(0);
      await mouse.click(left + width / 2, top + height / 2);
      await expect.poll(() => {
        const now = opened.director.now();
        const position = musicPosition(opened.director.snapshot().mix.table.music!, now)!;
        return position.frame / position.frames;
      }).toBeGreaterThan(0.45);
      expect(opened.director.snapshot().mix.listChange).not.toBeNull();
    }, 180_000);
  });

  it('moves the track by a press or drag along its waveform, and shows it while held', async () => {
    await open1644();
    if (!tab) return;
    await allReady(tab);
    await userEvent.keyboard('1');
    await expect.poll(() => document.querySelector('.atlas-sound-music__wave')).not.toBeNull();
    const { director } = tab;
    const place = (): number => {
      const now = director.now();
      const play = soundingMusic(director.snapshot().mix.table, now);
      const position = play && musicPosition(play, now);
      return position ? position.frame / position.frames : NaN;
    };
    await expect.poll(place).toBeGreaterThan(0);
    const wave = document.querySelector<HTMLElement>('.atlas-sound-music__wave')!;
    const { width, height } = wave.getBoundingClientRect();
    // What shows state takes the GM's accent, and what is still to play stays neutral.
    const accent = getComputedStyle(wave).getPropertyValue('--interactive-accent').trim();
    const probe = wave.ownerDocument.body.createDiv();
    probe.style.color = accent;
    const accentColor = getComputedStyle(probe).color;
    probe.remove();
    expect(getComputedStyle(wave.querySelector('.atlas-sound-music__played')!).color).toBe(accentColor);
    expect(getComputedStyle(wave.querySelector('.atlas-sound-music__unplayed')!).color).not.toBe(accentColor);
    await userEvent.click(wave, { position: { x: width * 0.75, y: height / 2 } });
    await expect.poll(place).toBeCloseTo(0.75, 1);
    await userEvent.dragAndDrop(page.elementLocator(wave), page.elementLocator(wave), { sourcePosition: { x: width * 0.75, y: height / 2 }, targetPosition: { x: width * 0.25, y: height / 2 } });
    await expect.poll(place).toBeCloseTo(0.25, 1);
    expect(wave.getAttribute('aria-label')).toBe('Position in the track');

    // Left and right change the page even from the waveform; Home still takes it to the start.
    act(() => wave.focus());
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab.store.getState().dmScreenPage).toBe('statblocks');
    await userEvent.keyboard('{ArrowRight}');
    expect(tab.store.getState().dmScreenPage).toBe('sound');
    act(() => wave.focus());
    await userEvent.keyboard('{Home}');
    expect(place()).toBeLessThan(0.05);
  });

  it('marks the moods linked to the open scene', async () => {
    await open1644();
    if (!tab) return;
    const [first, second] = [...document.querySelectorAll<HTMLElement>('.atlas-sound-mood')];
    expect(document.querySelector('.atlas-sound-mood__link')).toBeNull();
    const moodOf = (tile: HTMLElement | undefined): string => tile?.querySelector<HTMLElement>('[data-sound-mood]')?.dataset.soundMood ?? '';
    const { setSceneSound } = tab.store.getState();
    act(() => setSceneSound({ mood: moodOf(first), combatMood: moodOf(second) }));
    expect(first?.querySelector('.atlas-sound-mood__link')?.getAttribute('aria-label')).toBe('Linked to this scene');
    expect(second?.querySelector('.atlas-sound-mood__link')?.getAttribute('aria-label')).toBe('Plays in fights in this scene');
    act(() => setSceneSound(null));
    expect(document.querySelector('.atlas-sound-mood__link')).toBeNull();
  });

  it('shows the thumbnail of the scene that links a mood behind it, faded in from the right', async () => {
    await open1644();
    if (!tab) return;
    const first = document.querySelector<HTMLElement>('.atlas-sound-mood')!;
    const moodId = first.querySelector<HTMLElement>('[data-sound-mood]')!.dataset.soundMood!;
    expect(first.querySelector('.atlas-sound-mood__scene')).toBeNull();
    await tab.app.vault.create('Scenes/Keep.thumb.jpg', 'jpg');
    vi.spyOn(tab.app.vault, 'getResourcePath').mockReturnValue(sceneThumb);
    act(() => tab?.store.setState({ mapPath: 'Scenes/Keep.atlasmap' }));
    act(() => tab?.store.getState().setSceneSound({ mood: moodId }));
    const image = await expect.poll(() => first.querySelector<HTMLImageElement>('.atlas-sound-mood__scene')).not.toBeNull().then(() => first.querySelector<HTMLImageElement>('.atlas-sound-mood__scene')!);
    await expect.poll(() => image.hasAttribute('data-shown')).toBe(true);
    await expect.poll(() => getComputedStyle(image).opacity).toBe('0.5');
    // Under the crest and the text, covering the tile, and no target for the pointer.
    const press = first.querySelector<HTMLElement>('.atlas-sound-mood__press')!.getBoundingClientRect();
    // It settles from a slight zoom as it fades in.
    await expect.poll(() => Math.abs(image.getBoundingClientRect().width - press.width)).toBeLessThan(0.5);
    expect(Math.abs(image.getBoundingClientRect().height - press.height)).toBeLessThan(0.5);
    expect(getComputedStyle(image).pointerEvents).toBe('none');
    expect(image.compareDocumentPosition(first.querySelector('.atlas-sound-mood__name')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await page.screenshot({ path: `${SHOTS}/mood-scene.png`, element: first });
    act(() => tab?.store.getState().setSceneSound(null));
    await expect.poll(() => first.querySelector('.atlas-sound-mood__scene')).toBeNull();
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
    // The way back to the mood as saved, while it reads changed: one entry of the mix's menu.
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-desk__head .atlas-sound-icon')!);
    await expect.poll(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Back to Tavern at night')).toBeDefined();
    await userEvent.click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Back to Tavern at night')!);
    await expect.poll(head).not.toContain('changed');
    await expect.poll(() => tab?.director.snapshot().mix.table.layers[0]?.gainDb).not.toBe(-20);
    act(() => tab?.director.desk.setLayerLevel(layer?.sound.key ?? '', -20));
    await expect.poll(head).toContain('changed');
    await userEvent.click([...document.querySelectorAll<HTMLElement>('.atlas-sound-desk__head button')].find((button) => button.textContent === 'Save to mood')!);
    await expect.poll(head).not.toContain('changed');
    expect(tab.moodsOf()[0]?.layers.some((saved) => saved.levelDb === -20)).toBe(true);

    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-desk__head .atlas-sound-icon')!);
    await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    const clear = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes('Clear the mix'))!;
    await userEvent.click(clear);
    // Clearing ends what plays for good, so it asks first, by name.
    await expect.poll(() => document.querySelector('.atlas-text-dialog')?.textContent).toContain('Clear the mix?');
    expect(tab.director.snapshot().mix.table.layers.length).toBeGreaterThan(0);
    await userEvent.click([...document.querySelectorAll<HTMLElement>('.atlas-text-dialog button')].find((button) => button.textContent === 'Clear the mix')!);
    await expect.poll(() => tab?.director.snapshot().mix.table.layers.length).toBe(0);
    await expect.poll(() => document.querySelector('.atlas-sound-stop-all')).toBeNull();
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

  it('edits a mood in a popover under its tile, with round tones and crests by theme', async () => {
    await open1644();
    if (!tab) return;
    const first = tab.moodsOf()[0];
    const openEditor = async (): Promise<HTMLElement> => {
      act(() => document.querySelector<HTMLElement>('[data-sound-mood]')?.focus());
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
      await userEvent.click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Edit')!);
      await expect.poll(() => document.querySelector('.atlas-sound-popover')).not.toBeNull();
      return document.querySelector<HTMLElement>('.atlas-sound-popover')!;
    };
    let popover = await openEditor();
    await act(async () => { await Promise.all(popover.getAnimations().map((animation) => animation.finished)); });
    const tile = document.querySelector<HTMLElement>('.atlas-sound-mood')!.getBoundingClientRect();
    await expect.poll(() => popover.getBoundingClientRect().top).toBeGreaterThan(tile.bottom);
    const box = popover.getBoundingClientRect();
    const caret = popover.querySelector('.atlas-sound-popover__caret')!.getBoundingClientRect();
    expect(Math.abs(caret.left + caret.width / 2 - (tile.left + tile.width / 2))).toBeLessThan(2);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(popover.querySelector('input[type="range"]')).toBeNull();
    for (const swatch of popover.querySelectorAll<HTMLElement>('.atlas-sound-look__tone')) {
      const { width, height } = swatch.getBoundingClientRect();
      expect([width, height]).toEqual([22, 22]);
    }
    expect([...popover.querySelectorAll('.atlas-sound-look__group-label')].map((label) => label.textContent)).toContain('Dread');

    await userEvent.keyboard('{Escape}');
    await expect.poll(() => document.querySelector('.atlas-sound-popover')).toBeNull();
    popover = await openEditor();
    act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await expect.poll(() => document.querySelector('.atlas-sound-popover')).toBeNull();

    popover = await openEditor();
    await userEvent.click(popover.querySelectorAll<HTMLElement>('.atlas-sound-look__tone')[6]!);
    const ghost = popover.querySelector<HTMLElement>('.atlas-sound-look__crest[aria-label="Ghost"]')!;
    await userEvent.click(ghost);
    expect(popover.querySelector('.atlas-sound-look__crest[aria-checked="true"]')).toBe(ghost);
    await userEvent.click(popover.querySelector<HTMLElement>('.atlas-sound-popover__save')!);
    await expect.poll(() => tab?.moodsOf().find((mood) => mood.id === first?.id)?.tone).toBe('azure');
    expect(tab.moodsOf().find((mood) => mood.id === first?.id)?.icon).toBe('ghost');
    expect(document.querySelector('.atlas-sound-mood svg.atlas-sound-mood__crest path')?.getAttribute('d')).toBe(MOOD_CREST_PATHS.ghost);
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
    await expect.poll(() => getComputedStyle(document.querySelector('.atlas-dm-sound-page')!).display).toBe('none');
    const notes = box('.atlas-dm-notes-section');
    expect(notes.width).toBeGreaterThan(300);
  });

  it('turns pages: the one chosen slides in from its side as the one left slides out to its own, and the thumb follows', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    const statblocks = document.querySelector<HTMLElement>('.atlas-dm-screen-content')!;
    const sound = document.querySelector<HTMLElement>('.atlas-dm-sound-page')!;
    const thumbX = (): number => new DOMMatrix(getComputedStyle(document.querySelector('.atlas-dm-screen-pages')!, '::before').transform).e;
    const shiftOf = (element: HTMLElement): number => new DOMMatrix(getComputedStyle(element).transform).e;
    const options = document.querySelectorAll<HTMLElement>('.atlas-dm-screen-pages [role="radio"]');
    expect(options[0]!.getBoundingClientRect().width).toBeCloseTo(options[1]!.getBoundingClientRect().width, 0);
    expect(options[1]!.textContent).toBe('Sound');
    await expect.poll(thumbX).toBeGreaterThan(100);

    act(() => document.querySelector<HTMLElement>('.atlas-sound-pane')?.focus());
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab.store.getState().dmScreenPage).toBe('statblocks');
    // Mid-turn both are drawn: the statblocks come in from the left, the Sound page leaves to the right, inert.
    expect(statblocks.dataset.from).toBe('before');
    expect(sound.dataset.page).toBe('after');
    expect(sound.hidden).toBe(false);
    expect(sound.inert).toBe(true);
    await expect.poll(() => shiftOf(sound)).toBeGreaterThan(4);
    expect(shiftOf(statblocks)).toBeLessThan(0);
    await expect.poll(() => sound.hidden, { timeout: 2000 }).toBe(true);
    expect(shiftOf(statblocks)).toBeCloseTo(0, 1);
    expect(statblocks.dataset.from).toBeUndefined();
    expect(thumbX()).toBeCloseTo(0, 0);

    // Back before the turn ends: the Sound page returns from where it is, and stays.
    act(() => tab?.store.getState().setDMScreenPage('sound'));
    act(() => tab?.store.getState().setDMScreenPage('statblocks'));
    act(() => tab?.store.getState().setDMScreenPage('sound'));
    await expect.poll(() => statblocks.hidden, { timeout: 2000 }).toBe(true);
    expect(sound.hidden).toBe(false);
    expect(sound.inert).toBe(false);
    await expect.poll(() => getComputedStyle(sound).opacity).toBe('1');
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

  it('plays by keys like a game: arrows change pages and move no focus, no ring shows, digits and Enter press moods', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
    await allReady(tab);
    const ids = tab.moodsOf().map((mood) => mood.id);

    // Keycaps for the page keys flank the page control, as tall as it.
    const keys = [...document.querySelectorAll<HTMLElement>('.atlas-dm-screen-key')];
    const control = document.querySelector<HTMLElement>('.atlas-dm-screen-pages')!.getBoundingClientRect();
    expect(keys.map((key) => key.textContent)).toEqual(['\u2190', '\u2192']);
    expect(keys[0]!.getBoundingClientRect().right).toBeLessThanOrEqual(control.left);
    expect(keys[1]!.getBoundingClientRect().left).toBeGreaterThanOrEqual(control.right);
    await page.screenshot({ path: `${SHOTS}/page-keys.png`, element: document.querySelector<HTMLElement>('.atlas-dm-screen-header')! });

    // From a focused mood, the arrows change the page and leave focus where it was; no ring shows.
    const mood = document.querySelector<HTMLElement>(`[data-sound-mood="${ids[0]}"]`)!;
    // The shadow's shape: a colour mid-transition may be written in another notation.
    const shape = (shadow: string): string => shadow.replace(/\w+\([^)]*\)/g, 'colour');
    const resting = { outline: getComputedStyle(mood).outlineStyle, shadow: shape(getComputedStyle(mood).boxShadow) };
    // A key first, so the focus that follows counts as the keyboard's and would show a ring.
    await userEvent.keyboard('{Shift}');
    act(() => mood.focus());
    // Focused from the keyboard's side, it looks as it rests.
    expect(mood.matches(':focus-visible')).toBe(true);
    expect({ outline: getComputedStyle(mood).outlineStyle, shadow: shape(getComputedStyle(mood).boxShadow) }).toEqual(resting);
    for (const key of ['{ArrowDown}', '{ArrowUp}']) {
      await userEvent.keyboard(key);
      expect(document.activeElement).toBe(mood);
    }
    await userEvent.keyboard('{ArrowRight}');
    expect(tab.store.getState().dmScreenPage).toBe('statblocks');
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab.store.getState().dmScreenPage).toBe('sound');

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
    // Enter with nothing focused is next; Backspace is Stop all and brings back.
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
    // Real input to one point: the tiles move aside live, so a target that is followed moves away for ever.
    const centre = (id: string | undefined): { x: number; y: number } => {
      const { left, top, width, height } = document.querySelector(`[data-sound-mood="${id}"]`)!.getBoundingClientRect();
      return { x: left + width / 2, y: top + height / 2 };
    };
    const to = centre(before[2]);
    await pressAndMove(centre(before[0]), to, 8);
    await mouse.up(to.x, to.y);
    await expect.poll(() => tab?.moodsOf().map((mood) => mood.id)).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
    expect(tab.director.snapshot().mix.mood).toBeNull();
    // The press after a drag is a press again.
    await userEvent.click(document.querySelector<HTMLElement>(`[data-sound-mood="${before[1]}"]`)!);
    expect(tab.director.snapshot().mix.mood?.id).toBe(before[1]);
  });

  it('leaves the moods as they are where the screen goes during a drag', async () => {
    await page.viewport(1280, 820);
    tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
    const before = tab.moodsOf().map((mood) => mood.id);
    const card = document.querySelector<HTMLElement>(`[data-sound-mood="${before[2]}"]`)!;
    const { left, top, width, height } = card.getBoundingClientRect();
    const from = { x: left + width / 2, y: top + height / 2 };
    const to = { x: from.x + width / 2, y: from.y + height };
    await pressAndMove(from, to, 8);
    const page_ = card.closest<HTMLElement>('.atlas-sound-pane')!;
    page_.style.display = 'none';
    await mouse.up(to.x, to.y);
    page_.style.display = '';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(tab.moodsOf().map((mood) => mood.id)).toEqual(before);
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
