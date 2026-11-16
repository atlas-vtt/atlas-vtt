import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import type { Mood } from '@/app/sound/soundTypes';
import { recordIdFor } from '@/app/soundLibrary/libraryRecords';
import { musicPosition } from '@/app/soundDirector/musicList';
import { ATLAS, LIGHT, openSoundTab, type SoundTab, type TabSound } from './soundTabHarness';

vi.mock('../../../src/app/react/components/dm-screen/DMStatblocksPane', async () => {
  const { createElement } = await import('react');
  return { DMStatblocksPane: () => createElement('div', { className: 'atlas-dm-statblocks-section' }) };
});
vi.mock('../../../src/app/react/components/dm-screen/useDMScreenStatblocks', () => ({ useDMScreenStatblocks: () => ({ statblocks: new Map(), loading: false }) }));

const SHOTS = '__screenshots__/sound-whole';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms); });

const music = (seed: number, seconds = 3): TabSound => ({ synth: { seconds, seed }, kind: 'music' });
const ambience = (seed: number): TabSound => ({ synth: { seconds: 3, seed }, kind: 'ambience' });

/** The mockup's table, in real files. */
const TABLE: Record<string, TabSound> = {
  'Road to Wolfhaven': music(3, 70),
  'The drowned chapel': music(2),
  'Grey miles': music(4),
  'Steel in the reeds': music(5),
  Embers: music(6),
  'Hey, ho, the lute': music(7),
  'Under the hill': music(8),
  'The last gate': music(9),
  'First light': music(10),
  'Tavern crowd': ambience(21),
  'Campfire crackle': ambience(22),
  'Rain on shutters': ambience(23),
  'Night crickets': ambience(24),
  'Dripping water': ambience(25),
  'Low drone': ambience(26),
  Rats: ambience(27),
  'River rush': ambience(28),
};

type Spec = [string, Mood['icon'], string, string[], string[]];

const MOODS: Spec[] = [
  ['Tavern at night', 'inn', 'amber', ['Road to Wolfhaven', 'The drowned chapel'], ['Tavern crowd', 'Campfire crackle', 'Rain on shutters']],
  ['Rain on the road', 'road', 'sea', ['Grey miles', 'Road to Wolfhaven'], ['Rain on shutters', 'Night crickets']],
  ['Sewers', 'dungeon', 'vert', [], ['Dripping water', 'Low drone', 'Rats']],
  ['Ambush at the bridge', 'combat', 'gules', ['Steel in the reeds', 'The drowned chapel'], ['River rush']],
  ['Quiet camp', 'camp', 'tenne', ['Embers', 'Grey miles'], ['Campfire crackle', 'Night crickets']],
  ['The chapel', 'temple', 'purpure', ['The drowned chapel', 'Embers'], ['Low drone']],
  ['Market day', 'shop', 'or', ['Hey, ho, the lute', 'Road to Wolfhaven'], ['Tavern crowd', 'River rush']],
  ['Storm over the fen', 'swamp', 'azure', [], ['Rain on shutters', 'River rush', 'Night crickets']],
  ['The barrow', 'graveyard', 'stone', ['Under the hill', 'Embers'], ['Cave wind']],
  ['Boss', 'boss', 'gules', ['The last gate', 'Steel in the reeds'], ['Low drone']],
  ['Dawn', 'mountain', 'rose', ['First light', 'Grey miles'], ['Night crickets']],
];

const LEVELS = [-12, -3, -8, -9, -5, -6, -7, -10];

function seed(tab: SoundTab): void {
  const id = (name: string): string => tab.records.get(name)?.id ?? recordIdFor(`audio/${name}.ogg`);
  for (const [name, icon, tone, tracks, layers] of MOODS) {
    tab.moods.createMood({
      name,
      fadeSeconds: 3,
      ...(icon && { icon }),
      tone,
      music: tracks.length > 0 ? { tracks: tracks.map(id), shuffle: false, levelDb: -3 } : 'none',
      layers: layers.map((layer, index) => ({ sound: id(layer), levelDb: LEVELS[index] ?? -6 })),
    });
  }
}

async function ready(tab: SoundTab): Promise<void> {
  const records = [...tab.records.values()];
  tab.director.shelf.request(records);
  await expect.poll(() => records.every((record) => tab.director.shelf.stateOf(record).state === 'ready'), { timeout: 120_000, interval: 200 }).toBe(true);
  const road = tab.records.get('Road to Wolfhaven');
  await expect.poll(() => (road && tab.director.shelf.infoOf(road) ? tab.director.shelf.peaksOfKey(tab.director.shelf.infoOf(road)?.key ?? '') : null) !== null, { timeout: 60_000, interval: 200 }).toBe(true);
}

describe('how the Sound page looks', () => {
  let viewport: HTMLElement;
  let tab: SoundTab | null = null;

  /** A window large enough that the tester's frame is not scaled to fit it, at the mockup's pixel ratio. */
  async function resize(width: number, height: number): Promise<void> {
    await cdp().send('Emulation.setDeviceMetricsOverride', { width: width + 60, height: height + 60, deviceScaleFactor: 1.5, mobile: false });
    await sleep(50);
    await page.viewport(width - 1, height - 1);
    await page.viewport(width, height);
    viewport.style.width = `${width}px`;
    viewport.style.height = `${height}px`;
  }

  const shoot = (name: string): Promise<unknown> => page.screenshot({ path: `${SHOTS}/${name}.png`, element: viewport });

  async function open(theme: string, width = 1644, height = 960, linked = true): Promise<SoundTab> {
    await resize(width, height);
    tab = await openSoundTab(theme, viewport, undefined, TABLE, linked);
    if (linked) act(() => tab?.library.place.show('music', ['Battle']));
    await act(async () => { await sleep(150); });
    await expect.poll(() => document.querySelector('.atlas-dm-screen.is-visible')).not.toBeNull();
    await Promise.all(document.querySelector('.atlas-dm-screen')?.getAnimations().map((animation) => animation.finished) ?? []);
    return tab;
  }

  async function playing(theme: string, width?: number, height?: number): Promise<SoundTab> {
    const opened = await open(theme, width, height);
    seed(opened);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(MOODS.length);
    await ready(opened);
    await opened.addUnfinished('Cave wind', 'ambience');
    opened.director.players.use(null);
    await userEvent.keyboard('1');
    await act(async () => { await sleep(3400); });
    return opened;
  }

  beforeEach(() => {
    viewport = document.body.createDiv();
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; contain: strict; overflow: hidden; background: #080706';
  });

  afterEach(() => {
    tab?.unmount();
    tab = null;
    viewport.remove();
  });

  it('sets the first row of the rail concentric with the corner of the panel', async () => {
    await open(ATLAS);
    const rectOf = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
    const root = rectOf('.atlas-sound-lib__root');
    const pane = rectOf('.atlas-sound-pane');
    const paneStyle = getComputedStyle(document.querySelector('.atlas-sound-pane')!);
    const border = parseFloat(paneStyle.borderLeftWidth);
    const inset = root.left - pane.left - border;
    expect(root.top - pane.top - border).toBeCloseTo(inset, 0);
    const rootStyle = getComputedStyle(document.querySelector('.atlas-sound-lib__root')!);
    // A border of 1.5 px reads as 1 here, so within a pixel.
    expect(Math.abs(parseFloat(rootStyle.borderTopLeftRadius) - (parseFloat(paneStyle.borderTopLeftRadius) - border - inset))).toBeLessThan(1);
    expect(rootStyle.borderBottomLeftRadius).toBe('9px');
    expect(getComputedStyle(document.querySelector('.atlas-sound-lib__root-name')!).justifyContent).toBe('flex-start');
  });

  it('playing, changed and silenced', async () => {
    const shown = await playing(ATLAS);
    await shoot('playing');
    const crowd = shown.director.snapshot().mix.table.layers[0];
    if (crowd) act(() => shown.director.desk.setLayerLevel(crowd.sound.key, -20));
    await act(async () => { await sleep(300); });
    await shoot('changed');
    await userEvent.keyboard('{Backspace}');
    await act(async () => { await sleep(1500); });
    await shoot('silenced');
  }, 240_000);

  it('empty: nothing linked and no moods', async () => {
    await open(ATLAS, 1644, 960, false);
    await shoot('empty');
  }, 120_000);

  it('eleven moods over a tag of 5,000 files', async () => {
    const opened = await open(ATLAS);
    seed(opened);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(MOODS.length);
    for (let index = 0; index < 5000; index++) opened.locations?.music.addFile(`Battle/Huge/Track ${index} of the long campaign with a very long name indeed.mp3`);
    act(() => opened.library.place.show('music', ['Huge']));
    await act(async () => { await sleep(1500); });
    await shoot('five-thousand');
  }, 120_000);

  it('the mood dialog, a mood menu and a list of tracks', async () => {
    const shown = await playing(ATLAS);
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-music__list')!);
    await act(async () => { await sleep(200); });
    await shoot('tracks');
    await userEvent.keyboard('{Escape}');
    act(() => document.querySelector<HTMLElement>('[data-sound-mood]')?.focus());
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => { await sleep(200); });
    await shoot('mood-menu');
    await userEvent.click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Edit')!);
    await expect.poll(() => document.querySelector('.atlas-sound-popover')).not.toBeNull();
    await act(async () => { await sleep(300); });
    await shoot('mood-dialog');
    expect(shown.moodsOf()).toHaveLength(MOODS.length);
  }, 240_000);

  it('the open list stands under a shorter waveform at every desk', async () => {
    const shown = await playing(ATLAS);
    const list = ['Grey miles', 'The drowned chapel', 'Steel in the reeds', 'Embers', 'Hey, ho, the lute', 'Under the hill', 'The last gate', 'First light', 'Road to Wolfhaven'].flatMap((name) => shown.records.get(name) ?? []);
    act(() => shown.director.desk.playList(list, false));
    await act(async () => { await sleep(600); });
    await userEvent.hover(document.querySelector<HTMLElement>('.atlas-sound-music')!);
    await shoot('card-closed-336');
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-music__list')!);
    await act(async () => { await sleep(300); });
    const measure = (): { desk: number; wave: number; list: number; rows: number; clock: DOMRect; body: DOMRect } => ({
      desk: document.querySelector('.atlas-sound-desk')!.getBoundingClientRect().height,
      wave: document.querySelector('.atlas-sound-music__wave')!.getBoundingClientRect().height,
      list: document.querySelector('.atlas-sound-queue')!.getBoundingClientRect().height,
      rows: document.querySelectorAll('.atlas-sound-queue .atlas-sound-track').length,
      clock: document.querySelector('.atlas-sound-music__clock')!.getBoundingClientRect(),
      body: document.querySelector('.atlas-sound-music__body')!.getBoundingClientRect(),
    });
    const shape = measure();
    expect(shape.desk).toBe(336);
    expect(shape.wave).toBe(28);
    expect(shape.rows).toBe(list.length);
    expect(shape.list).toBeGreaterThan(90);
    await shoot('list-open-336');
    await resize(1280, 700);
    await act(async () => { await sleep(400); });
    const low = measure();
    expect(low.desk).toBe(288);
    expect(low.wave).toBe(28);
    expect(low.list).toBeGreaterThan(60);
    expect(low.clock.bottom).toBeLessThanOrEqual(low.body.bottom + 0.5);
    await shoot('list-open-288');
    await resize(760, 800);
    await act(async () => { await sleep(400); });
    const narrow = measure();
    expect(narrow.desk).toBe(264);
    expect(narrow.wave).toBe(28);
    expect(narrow.list).toBeGreaterThan(40);
    expect(narrow.clock.bottom).toBeLessThanOrEqual(narrow.body.bottom + 0.5);
    expect(document.querySelector('.atlas-sound-music__actions')!.getBoundingClientRect().left).toBeGreaterThanOrEqual(document.querySelector('.atlas-sound-music__time')!.getBoundingClientRect().right);
    await shoot('list-open-264');
  }, 240_000);

  describe('the music card’s queue, by hand', () => {
    const NAMES = ['Road to Wolfhaven', 'Grey miles', 'The drowned chapel', 'Steel in the reeds', 'Embers'];
    const rows = (): string[] => [...document.querySelectorAll('.atlas-sound-queue .atlas-sound-tracks:first-of-type > .atlas-sound-track__name, .atlas-sound-queue > .atlas-sound-tracks:first-of-type .atlas-sound-track__name')].map((row) => row.textContent ?? '');
    const row = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('.atlas-sound-queue .atlas-sound-track')].find((one) => one.textContent?.includes(name))!;
    async function queue(): Promise<SoundTab> {
      const shown = await playing(ATLAS);
      // The first is 70 s, so it stands still while this looks at it.
      act(() => shown.director.desk.playList(NAMES.flatMap((name) => shown.records.get(name) ?? []), false));
      await act(async () => { await sleep(400); });
      await userEvent.hover(document.querySelector<HTMLElement>('.atlas-sound-music')!);
      await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-music__list')!);
      await expect.poll(rows).toEqual(NAMES);
      return shown;
    }

    it('shows a row’s handle on hover', async () => {
      await queue();
      await userEvent.hover(row('Grey miles'));
      await expect.poll(() => getComputedStyle(row('Grey miles').querySelector('.atlas-sound-track__grip')!).opacity).toBe('1');
      await shoot('list-hover');
    }, 240_000);

    it('shows no handles while shuffled, the real order, and what plays in the accent', async () => {
      const shown = await queue();
      expect(document.querySelectorAll('.atlas-sound-track__grip').length).toBe(NAMES.length);
      const accent = getComputedStyle(document.body).getPropertyValue('--text-accent');
      const probe = document.body.createDiv();
      probe.style.color = accent;
      const accentColor = getComputedStyle(probe).color;
      probe.remove();
      expect(getComputedStyle(row('Road to Wolfhaven')).color).toBe(accentColor);
      expect(row('Road to Wolfhaven').querySelector('.atlas-sound-track__mark')).not.toBeNull();
      expect(row('Grey miles').querySelector('.atlas-sound-track__mark')).toBeNull();

      await userEvent.click(document.querySelector<HTMLElement>('[aria-pressed="true"].atlas-sound-music__list + button, .atlas-sound-music__list ~ button')!);
      await expect.poll(() => document.querySelectorAll('.atlas-sound-track__grip').length).toBe(0);
      const { mix } = shown.director.snapshot();
      expect(mix.listChange?.shuffle).toBe(true);
      expect(rows()[0]).toBe('Road to Wolfhaven');
      expect([...rows()].sort()).toEqual([...NAMES].sort());
      await shoot('list-shuffled');
    }, 240_000);

    it('clear keeps what plays, Back restarts it, stop after and repeat are toggles, and Played plays what was', async () => {
      const shown = await queue();
      const { director } = shown;
      const actions = [...document.querySelectorAll<HTMLElement>('.atlas-sound-music__actions button')];
      const [, , repeat, stopAfter, back, skip] = actions;
      expect(actions).toHaveLength(6);

      await userEvent.click(repeat!);
      await expect.poll(() => repeat!.getAttribute('aria-pressed')).toBe('true');
      expect(director.snapshot().mix.listChange?.repeat).toBe('one');
      await userEvent.click(repeat!);
      expect(director.snapshot().mix.listChange?.repeat).toBe('off');
      await userEvent.click(repeat!);
      await expect.poll(() => repeat!.getAttribute('aria-pressed')).toBe('false');
      expect(director.snapshot().mix.listChange).toBeNull();

      await userEvent.click(stopAfter!);
      await expect.poll(() => stopAfter!.getAttribute('aria-pressed')).toBe('true');
      await shoot('card-modes');
      await userEvent.click(stopAfter!);
      await expect.poll(() => stopAfter!.getAttribute('aria-pressed')).toBe('false');

      await act(async () => { await sleep(3400); });
      await userEvent.click(back!);
      await act(async () => { await sleep(100); });
      const play = director.snapshot().mix.table.music!;
      expect(musicPosition(play, director.now())!.frame / 48_000).toBeLessThan(1);
      expect(musicPosition(play, director.now())!.track.key).toBe(director.shelf.infoOf(shown.records.get('Road to Wolfhaven')!)!.key);

      await userEvent.click(skip!);
      await expect.poll(() => row('Grey miles').getAttribute('aria-current'), { timeout: 8000 }).toBe('true');
      await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-queue__head button')!);
      await expect.poll(rows).toHaveLength(1);
      expect(row('Grey miles').getAttribute('aria-current')).toBe('true');

      const toggle = await vi.waitFor(() => {
        const found = document.querySelector<HTMLElement>('.atlas-sound-played__toggle');
        if (!found) throw new Error('no Played yet');
        return found;
      }, { timeout: 8000 });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(document.querySelector('.atlas-sound-played .atlas-sound-track')).toBeNull();
      await userEvent.click(toggle);
      const played = document.querySelector<HTMLElement>('.atlas-sound-played .atlas-sound-track')!;
      expect(played.textContent).toContain('Road to Wolfhaven');
      await shoot('list-played');
      await userEvent.click(played.querySelector('button')!);
      await expect.poll(() => director.desk.nextTrack() !== undefined && document.querySelector('.atlas-sound-music__track')?.textContent, { timeout: 8000 }).toBe('Road to Wolfhaven');
    }, 240_000);
  });

  it('light', async () => {
    await playing(LIGHT);
    await shoot('light');
  }, 240_000);

  it('1280 wide, narrow and stacked', async () => {
    await playing(ATLAS, 1280, 800);
    await shoot('wide-1280');
    await resize(1100, 800);
    await act(async () => { await sleep(400); });
    await shoot('narrow-1100');
    await resize(720, 800);
    await act(async () => { await sleep(400); });
    await shoot('stacked-720');
  }, 240_000);
});
