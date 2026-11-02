import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import type { Mood } from '@/app/sound/soundTypes';
import { ATLAS, COLLECTION, LIGHT, openSoundTab, type SoundTab, type TabSound } from './soundTabHarness';

vi.mock('../../../src/app/react/components/dm-screen/DMStatblocksPane', async () => {
  const { createElement } = await import('react');
  return { DMStatblocksPane: () => createElement('div', { className: 'atlas-dm-statblocks-section' }) };
});
vi.mock('../../../src/app/react/components/dm-screen/useDMScreenStatblocks', () => ({ useDMScreenStatblocks: () => ({ statblocks: new Map(), loading: false }) }));

const SHOTS = '__screenshots__/sound-desk';
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
  'Cave wind': { synth: { seconds: 0, seed: 1 }, kind: 'ambience' },
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
  const id = (name: string): string => tab.records.get(name)?.id ?? name;
  for (const [name, icon, tone, tracks, layers] of MOODS) {
    tab.moods.createMood(COLLECTION, {
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
  const records = [...tab.records.values()].filter((record) => record.name !== 'Cave wind');
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

  /** `.atlas-dm-screen` is 96 % by 90 % of this, so the mockup's 1644 by 960. */
  async function open(theme: string, width = 1713, height = 1067): Promise<SoundTab> {
    await resize(width, height);
    tab = await openSoundTab(theme, viewport, undefined, TABLE);
    await act(async () => { await sleep(800); });
    return tab;
  }

  async function playing(theme: string, width?: number, height?: number): Promise<SoundTab> {
    const opened = await open(theme, width, height);
    seed(opened);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(MOODS.length);
    await ready(opened);
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

  it('empty', async () => {
    await open(ATLAS);
    await shoot('empty');
  }, 120_000);

  it('eight layers', async () => {
    const shown = await playing(ATLAS);
    for (const name of ['Night crickets', 'Dripping water', 'Low drone', 'Rats', 'River rush']) {
      const record = shown.records.get(name);
      if (record) act(() => { shown.director.desk.addSound(record); });
    }
    await act(async () => { await sleep(1500); });
    expect(shown.director.snapshot().mix.table.layers).toHaveLength(8);
    await shoot('eight-layers');
  }, 240_000);

  it('the mood dialog, the library view and a list of tracks', async () => {
    const shown = await playing(ATLAS);
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-music__list')!);
    await act(async () => { await sleep(200); });
    await shoot('tracks');
    await userEvent.click(document.querySelectorAll<HTMLElement>('.atlas-sound-views [role="radio"]')[1]!);
    await act(async () => { await sleep(200); });
    await shoot('library');
    await userEvent.click(document.querySelectorAll<HTMLElement>('.atlas-sound-views [role="radio"]')[0]!);
    act(() => document.querySelector<HTMLElement>('[data-sound-mood]')?.focus());
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => { await sleep(200); });
    await shoot('mood-menu');
    await userEvent.click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Edit')!);
    await expect.poll(() => document.querySelector('.atlas-sound-dialog')).not.toBeNull();
    await act(async () => { await sleep(300); });
    await shoot('mood-dialog');
    expect(shown.moodsOf()).toHaveLength(MOODS.length);
  }, 240_000);

  it('light', async () => {
    await playing(LIGHT);
    await shoot('light');
  }, 240_000);

  it('narrow panes', async () => {
    await playing(ATLAS, 1100, 800);
    await shoot('narrow-1100');
    await resize(720, 700);
    await act(async () => { await sleep(400); });
    await shoot('narrow-720');
  }, 240_000);
});
