import { act } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { ATLAS_DARK, mockLibrary, OBSIDIAN_LIGHT, settled, stageFrame } from './sound/libraryScene';
import { SoundPane } from '@/app/react/components/dm-screen/sound/SoundPane';
import { MoodStore } from '@/app/soundLibrary/MoodStore';
import type { LibraryRig } from '../helpers/libraryRig';

const SHOTS = '__screenshots__/sound-library';

/** Kept beside the shots, as a passing test prints nothing from the browser. */
async function writeMeasure(line: string): Promise<void> {
  measures.push(line);
  await commands.writeFile(`${SHOTS}/measures.txt`, measures.join('\n'));
}

const measures: string[] = [];

function box(selector: string, root: ParentNode = document): DOMRect {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element.getBoundingClientRect();
}

const rowNamed = (name: string): HTMLElement => {
  const row = [...document.querySelectorAll<HTMLElement>('.atlas-sound-lib__row')].find((one) => one.querySelector('.atlas-sound-lib__title')?.textContent === name);
  if (!row) throw new Error(`No row ${name}`);
  return row;
};

const tagNamed = (name: string): HTMLButtonElement => {
  const tag = [...document.querySelectorAll<HTMLButtonElement>('.atlas-sound-lib__tag')].find((one) => one.querySelector('span')?.textContent === name);
  if (!tag) throw new Error(`No tag ${name}`);
  return tag;
};

const pressTag = async (name: string): Promise<void> => {
  await userEvent.click(tagNamed(name));
  await settled();
};

const PAGE = createElement(SoundPane, { active: true });
const LIBRARY_SHOT = (host: HTMLElement): HTMLElement => host.closest<HTMLElement>('.lib-frame')!;

/** No side of the page leaves its text hanging: all it holds is laid out inside it, or hidden. */
function expectNoOverflow(): void {
  for (const element of document.querySelectorAll<HTMLElement>('.atlas-sound-lib__head, .atlas-sound-lib__row, .atlas-sound-lib__length, .atlas-sound-lib__state, .atlas-sound-lib__rows, .atlas-sound-moods, .atlas-sound-mood__foot')) {
    if (getComputedStyle(element).visibility === 'hidden') continue;
    expect(element.scrollWidth, element.className).toBeLessThanOrEqual(element.clientWidth + 1);
  }
}

const TILE_NAMES = ['Tavern at night', 'Rain on the road', 'Sewers', 'Ambush at the bridge', 'Quiet camp', 'The chapel', 'Market day', 'Storm over the fen', 'The barrow', 'Boss', 'Dawn'];

async function withMoods(opened: LibraryRig): Promise<void> {
  const moods = MoodStore.forApp(opened.app);
  for (const name of TILE_NAMES) moods.createMood({ name, fadeSeconds: 2, music: 'none', layers: [{ sound: `sound-${name}`, levelDb: -3 }, { sound: `other-${name}`, levelDb: -3 }] });
  await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(TILE_NAMES.length);
  await settled();
}

function expectTilesRead(columns: number): void {
  const tiles = [...document.querySelectorAll('.atlas-sound-mood')].map((tile) => tile.getBoundingClientRect());
  expect(tiles.filter((tile) => tile.top === tiles[0]?.top)).toHaveLength(columns);
  expect(new Set(tiles.map((tile) => Math.round(tile.height)))).toEqual(new Set([104]));
  for (const tile of document.querySelectorAll<HTMLElement>('.atlas-sound-mood')) {
    // The crest is a watermark: the lines run over it, to the tile's padding.
    const press = box('.atlas-sound-mood__press', tile);
    const padding = parseFloat(getComputedStyle(tile.querySelector('.atlas-sound-mood__press')!).paddingRight);
    for (const text of tile.querySelectorAll<HTMLElement>('.atlas-sound-mood__what span, .atlas-sound-mood__foot > *')) {
      expect(text.getBoundingClientRect().right, text.textContent ?? '').toBeLessThanOrEqual(press.right - padding + 1);
      expect(text.scrollWidth, text.textContent ?? '').toBeLessThanOrEqual(text.clientWidth + 1);
    }
    for (const line of tile.querySelectorAll<HTMLElement>('.atlas-sound-mood__what span')) {
      expect(line.getBoundingClientRect().width, line.textContent ?? '').toBeGreaterThan(press.width - 2 * padding - 1);
    }
    expect(box('.atlas-sound-mood__name', tile).right).toBeLessThanOrEqual(tile.getBoundingClientRect().right);
  }
}

describe('the sound library', () => {
  let rig: LibraryRig | null = null;
  let frame: ReturnType<typeof stageFrame> | null = null;

  afterEach(() => {
    rig?.unmount();
    rig = null;
    frame?.remove();
    frame = null;
  });

  async function open(theme = ATLAS_DARK, width = 1644, height = 960): Promise<LibraryRig> {
    await page.viewport(width, height);
    rig = await mockLibrary();
    frame = stageFrame(theme, width, height);
    rig.mount(frame.host, PAGE);
    await settled();
    rig.library.rescan(Date.now() + 100_000);
    await expect.poll(() => rig?.library.countOf('music', '')).toBe(58);
    await expect.poll(() => rig?.library.countOf('ambience', '')).toBe(121);
    await settled();
    return rig;
  }

  it('stands in the mock\'s proportions, and the row shows its action on hover alone', async () => {
    await open();
    await pressTag('Battle');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBe(14);
    expect(box('.atlas-sound-lib__rail').width).toBeGreaterThanOrEqual(192);
    expect(box('.atlas-sound-lib__rail').width).toBeLessThanOrEqual(232);
    // 58 % up to 860 px: past it the moods take the room.
    expect(box('.atlas-sound-lib').width).toBeCloseTo(860, 0);
    // The rows keep more than the 620 px under which the library goes narrow.
    expect(box('.atlas-sound-lib__main').width).toBeGreaterThanOrEqual(620);
    expect(getComputedStyle(document.querySelector('.atlas-sound-lib__btn--folds')!).display).not.toBe('none');
    expect(box('.atlas-sound-lib__head').height).toBe(56);
    expect(box('.atlas-sound-lib__row').height).toBe(38);
    // The rail names what is shown, so the head has no heading: the search starts at its left.
    expect(document.querySelector('.atlas-sound-lib__crumb')).toBeNull();
    expect(box('.atlas-sound-lib__search').left - box('.atlas-sound-lib__main').left).toBe(8);
    const row = rowNamed('The last gate');
    const action = row.querySelector<HTMLElement>('.atlas-sound-lib__act')!;
    expect(getComputedStyle(action).opacity).toBe('0');
    await userEvent.hover(row);
    await expect.poll(() => getComputedStyle(action).opacity).toBe('1');
    const fixed = (selector: string): number => box(selector, row).right - box('.atlas-sound-lib__main').left;
    const length = fixed('.atlas-sound-lib__length');
    expect(length).toBeGreaterThan(0);
    expect(rowNamed('Blood on the ford').querySelector('.atlas-sound-lib__length')?.textContent).toBe('3:42');
    expect(rowNamed('Boss 1').querySelector('.atlas-sound-lib__where')?.textContent).toBe('Battle · Bosses');
    expect(rowNamed('Boss 1').querySelector('.atlas-sound-lib__glyph')).toBeNull();
    expect(document.querySelector('.atlas-sound-views')).toBeNull();
    expectNoOverflow();
    const title = rowNamed('Riders at the treeline').querySelector<HTMLElement>('.atlas-sound-lib__title')!;
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    await withMoods(rig!);
    expectTilesRead(3);
    expectNoOverflow();
    expect(box('.atlas-sound-moods').left).toBeCloseTo(box('.atlas-sound-lib').right, 0);
  });

  it('gives a wide screen\'s room to the moods: four across on a stage of 1800 (a 1920 screen less its insets), the library as at 1644', async () => {
    await open(ATLAS_DARK, 1800, 1080);
    expect(box('.atlas-sound-lib').width).toBeCloseTo(860, 0);
    expect(box('.atlas-sound-lib__main').width).toBeGreaterThanOrEqual(620);
    await withMoods(rig!);
    expectTilesRead(4);
    expectNoOverflow();
    await page.screenshot({ path: `${SHOTS}/library-1800.png`, element: LIBRARY_SHOT(frame!.host) });
  });

  it('keeps name, state and length readable at 1280, the action over the length, and what does not fit in the head in a menu', async () => {
    await open(ATLAS_DARK, 1280, 800);
    await pressTag('Battle');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBeGreaterThan(4);
    expect(box('.atlas-sound-lib__rail').width).toBe(192);
    expect(box('.atlas-sound-lib').width / 1280).toBeCloseTo(0.58, 1);
    expectNoOverflow();
    const row = rowNamed('Riders at the treeline');
    const title = row.querySelector<HTMLElement>('.atlas-sound-lib__title')!;
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    await userEvent.hover(row);
    await expect.poll(() => getComputedStyle(row.querySelector('.atlas-sound-lib__act')!).opacity).toBe('1');
    // A glyph in the length's place: the name keeps its room while the row is pointed at.
    const act = box('.atlas-sound-lib__act', row);
    const length = box('.atlas-sound-lib__length', row);
    expect(act.left).toBeGreaterThanOrEqual(length.left - 1);
    expect(act.right).toBeLessThanOrEqual(length.right + 1);
    expect(act.width).toBe(28);
    expect(getComputedStyle(row.querySelector('.atlas-sound-lib__length')!).visibility).toBe('hidden');
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    expect(getComputedStyle(document.querySelector('.atlas-sound-lib__btn--folds')!).display).toBe('none');
    await withMoods(rig!);
    expectTilesRead(2);
    expectNoOverflow();
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-sound-lib__head-more')!);
    await expect.poll(() => [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(['Import']);
    await userEvent.keyboard('{Escape}');
  });

  it('sends a real file to the mix, and shows it there and what still converts', async () => {
    const r = await open();
    await pressTag('Battle');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBe(14);
    await userEvent.hover(rowNamed('Steel in the reeds'));
    await userEvent.click(rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__play')!);
    await expect.poll(() => rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__state')?.textContent, { timeout: 60_000 }).toBe('Playing');
    expect(rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__act')).toBeNull();
    await expect.poll(() => r.director.snapshot().mix.table.music?.tracks.length, { timeout: 60_000 }).toBe(1);
    expect(r.locations.music.reads).toContain('Battle/Steel in the reeds.ogg');
    await expect.poll(() => rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__play')?.getAttribute('aria-pressed')).toBe('true');
    // A read that never ends, as of a long file on a slow disk: the row says what goes on.
    await userEvent.click(rowNamed('Under siege'));
    await userEvent.keyboard(' ');
    await expect.poll(() => rowNamed('Under siege').querySelector('.atlas-sound-lib__state')?.textContent, { timeout: 30_000 }).toBe('Converting');
    await act(async () => { (document.activeElement as HTMLElement | null)?.blur(); await userEvent.unhover(rowNamed('Steel in the reeds')); });
    await settled();
    await page.screenshot({ path: `${SHOTS}/library.png`, element: LIBRARY_SHOT(frame!.host) });
    await userEvent.hover(rowNamed('Steel in the reeds'));
    await userEvent.click(rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__play')!);
    await expect.poll(() => rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__state')?.textContent).toBe('');
  });

  it('its rail lists a root\'s tags under it, by name, with counts, and shows what is selected, pointed at and dropped on', async () => {
    const r = await open();
    await pressTag('Battle');
    await pressTag('Bosses');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBe(5);
    const names = (section: number): (string | null | undefined)[] => [...document.querySelectorAll('.atlas-sound-lib__root-block')[section]!.querySelectorAll('.atlas-sound-lib__tag span')].map((one) => one.textContent);
    expect(names(0)).toEqual(['Battle', 'Bosses', 'Dread', 'Taverns', 'Travel', 'Wonder']);
    expect(names(1)).toEqual(['Dungeons', 'Towns', 'Weather', 'Wilds']);

    const selected = tagNamed('Battle');
    const unselected = tagNamed('Dread');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    await expect.poll(() => getComputedStyle(selected).color).toBe('rgb(229, 113, 113)');
    // A flex button whose content starts at its edge says so itself: Obsidian centres what a button holds.
    expect(getComputedStyle(selected).justifyContent).toBe('flex-start');
    expect(selected.getBoundingClientRect().height).toBe(28);
    expect(selected.querySelector('.atlas-sound-lib__glyph')!.getBoundingClientRect().left - selected.getBoundingClientRect().left).toBe(24);
    expect(selected.querySelector('small')!.getBoundingClientRect().right).toBeCloseTo(selected.getBoundingClientRect().right - 8, 0);

    await page.screenshot({ path: `${SHOTS}/library-tags.png`, element: LIBRARY_SHOT(frame!.host) });

    const line = unselected.parentElement!;
    const more = line.querySelector<HTMLElement>('.atlas-sound-lib__more')!;
    expect(getComputedStyle(more).opacity).toBe('0');
    await userEvent.hover(line);
    await expect.poll(() => getComputedStyle(more).opacity).toBe('1');
    await expect.poll(() => getComputedStyle(unselected.querySelector('small')!).opacity).toBe('0');
    expect(more.getBoundingClientRect().right).toBeLessThanOrEqual(unselected.getBoundingClientRect().right);
    await userEvent.click(more);
    await expect.poll(() => [...document.querySelectorAll('[role="menuitem"]')].map((item) => [item.textContent, item.getAttribute('aria-disabled')])).toEqual([['Rename', 'true'], ['Remove', 'true']]);
    await settled();
    await page.screenshot({ path: `${SHOTS}/library-tag-menu.png`, element: LIBRARY_SHOT(frame!.host) });
    await userEvent.keyboard('{Escape}');
    await settled();

    // A long name stops at the row's end instead of pushing the count out, however it was written.
    r.records.add([{ id: 'long', name: 'Long', tags: ['A tag with a name as long as a tag may have it'], createdAt: 1, modifiedAt: 1, audioPath: 'atlas-sound:music/Taverns/Track 1.ogg', kind: 'music' }]);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__tag').length).toBe(11);
    const long = tagNamed('A tag with a name as long as a tag may have it');
    expect(long.scrollWidth).toBeLessThanOrEqual(long.clientWidth + 1);
    expect(long.querySelector('span')!.getBoundingClientRect().right).toBeLessThanOrEqual(long.querySelector('small')!.getBoundingClientRect().left);

    // The target ring, as a drag of rows holds it over a tag.
    const transfer = new DataTransfer();
    transfer.setData('application/x-atlas-sound-rows', '{"files":[]}');
    unselected.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    await expect.poll(() => getComputedStyle(unselected).boxShadow).toContain('inset');
    unselected.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: transfer }));
    expectNoOverflow();
  });

  it('says where to begin when nothing is linked', async () => {
    await page.viewport(1644, 960);
    const { libraryRig } = await import('../helpers/libraryRig');
    rig = await libraryRig();
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host, PAGE);
    await settled();
    const title = document.querySelector('.atlas-sound-lib__nolink h2');
    expect(title?.textContent).toBe('Where is your music?');
    // Link music, link ambience, import, and the starter ambience, which comes once the folder was looked at.
    await vi.waitFor(() => expect(document.querySelector('.atlas-sound-lib__nolink .atlas-sound-lib__starter')).not.toBeNull());
    expect(document.querySelectorAll('.atlas-sound-lib__nolink button')).toHaveLength(4);
    const stage = box('.atlas-sound-lib');
    const heading = title!.getBoundingClientRect();
    expect(Math.abs((heading.left + heading.right) / 2 - (stage.left + stage.right) / 2)).toBeLessThan(1);
    await page.screenshot({ path: `${SHOTS}/library-empty.png`, element: LIBRARY_SHOT(frame.host) });
  });

  it('offers the starter ambience under the ambience root, inside the rail', async () => {
    await open();
    await expect.poll(() => document.querySelector('.atlas-sound-lib__rail .atlas-sound-lib__starter')).not.toBeNull();
    const offer = document.querySelector<HTMLElement>('.atlas-sound-lib__rail .atlas-sound-lib__starter')!;
    offer.scrollIntoView({ block: 'center' });
    await settled();
    const starter = offer.getBoundingClientRect();
    const rail = box('.atlas-sound-lib__rail');
    expect(offer.closest('[aria-label="Ambience"]')).not.toBeNull();
    expect(starter.left).toBeGreaterThanOrEqual(rail.left);
    expect(starter.right).toBeLessThanOrEqual(rail.right);
    expect(offer.scrollWidth).toBeLessThanOrEqual(offer.clientWidth + 1);
    await writeMeasure(`starter offer ${starter.width.toFixed(1)} × ${starter.height.toFixed(1)} in a rail of ${rail.width.toFixed(1)}`);
    await page.screenshot({ path: `${SHOTS}/library-starter.png`, element: LIBRARY_SHOT(frame!.host) });
  });

  it('holds in light mode', async () => {
    await open(OBSIDIAN_LIGHT);
    await pressTag('Battle');
    await userEvent.hover(rowNamed('The last gate'));
    await settled();
    // Play is a quiet button (the moods lead the page), and says what it plays: here what the tag leaves.
    const play = [...document.querySelectorAll<HTMLElement>('.atlas-sound-lib__head .atlas-sound-lib__btn')].find((button) => button.textContent === 'Play tagged')!;
    expect(play.classList.contains('atlas-sound-lib__btn--solid')).toBe(false);
    expect(getComputedStyle(play).color).not.toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: `${SHOTS}/library-light.png`, element: LIBRARY_SHOT(frame!.host) });
  });

  it('stands over the moods below the breakpoint, and its rail over the rows where it must', async () => {
    await open(ATLAS_DARK, 700, 960);
    await pressTag('Battle');
    await settled();
    const stage = box('.atlas-sound-lib');
    expect(stage.width).toBe(box('.atlas-sound-moods').width);
    expect(box('.atlas-sound-moods').top).toBeCloseTo(stage.bottom, 0);
    expect(box('.atlas-sound-lib__rail').right).toBeLessThanOrEqual(box('.atlas-sound-lib__main').left + 1);
    expectNoOverflow();
    const row = document.querySelector<HTMLElement>('.atlas-sound-lib__row')!;
    expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(stage.right);

    const place = document.querySelector<HTMLElement>('.lib-frame')!;
    place.style.width = '460px';
    await settled();
    expect(box('.atlas-sound-lib__rail').bottom).toBeLessThanOrEqual(box('.atlas-sound-lib__main').top + 1);
    expect(box('.atlas-sound-lib__rail').width).toBe(box('.atlas-sound-lib').width);
    await page.screenshot({ path: `${SHOTS}/library-narrow.png`, element: LIBRARY_SHOT(frame!.host) });
  });

  it('scrolls 5,000 files of a tag without losing a frame', async () => {
    const r = await open();
    for (let index = 0; index < 5000; index++) r.locations.music.addFile(`Huge/Track ${index}.mp3`);
    r.library.rescan(Date.now() + 200_000);
    await expect.poll(() => r.library.countOf('music', 'Huge'), { timeout: 30_000 }).toBe(5000);
    await settled();
    await pressTag('Huge');
    await expect.poll(() => document.querySelector('.atlas-sound-lib__rows [style*="height"]')?.getBoundingClientRect().height).toBe(5000 * 38);
    const list = document.querySelector<HTMLElement>('.atlas-sound-lib__rows')!;
    expect(document.querySelectorAll('.atlas-sound-lib__row').length).toBeLessThan(60);
    const frames: number[] = [];
    await new Promise<void>((resolve) => {
      let last = performance.now();
      let travelled = 0;
      const step = (now: number): void => {
        frames.push(now - last);
        last = now;
        travelled += 180;
        list.scrollTop = travelled;
        if (travelled < 5000 * 38 / 4) window.requestAnimationFrame(step);
        else resolve();
      };
      window.requestAnimationFrame(step);
    });
    frames.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    const line = `frames ${frames.length}, median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(1)} ms, worst ${sorted.at(-1)?.toFixed(1)} ms; rows mounted ${document.querySelectorAll('.atlas-sound-lib__row').length}`;
    await writeMeasure(`[library scroll] ${line}`);
    await page.screenshot({ path: `${SHOTS}/library-5000.png`, element: LIBRARY_SHOT(frame!.host) });
    expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(34);
  });

  it('opens 2,000 tracks at once and scrolls them as smoothly while every one of them is being prepared', async () => {
    await page.viewport(1644, 960);
    rig = await mockLibrary();
    for (let index = 0; index < 2000; index++) rig.locations.music.addFile(`Big ${index % 40}/Track ${index}.mp3`);
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    observer.observe({ type: 'longtask', buffered: false });
    frame = stageFrame(ATLAS_DARK);
    const opened = performance.now();
    rig.mount(frame.host, PAGE);
    await expect.poll(() => document.querySelector('.atlas-sound-lib__rows [role="row"]'), { timeout: 30_000 }).not.toBeNull();
    const firstRows = performance.now() - opened;
    await expect.poll(() => rig!.library.isWalked('music'), { timeout: 30_000 }).toBe(true);
    const walked = performance.now() - opened;
    const openLong = [...longTasks];
    longTasks.length = 0;
    const scroll = async (): Promise<number[]> => {
      const list = document.querySelector<HTMLElement>('.atlas-sound-lib__rows')!;
      list.scrollTop = 0;
      const frames: number[] = [];
      await new Promise<void>((resolve) => {
        let last = performance.now();
        let travelled = 0;
        const step = (now: number): void => {
          frames.push(now - last);
          last = now;
          travelled += 120;
          list.scrollTop = travelled;
          if (travelled < 2000 * 38 / 3) window.requestAnimationFrame(step);
          else resolve();
        };
        window.requestAnimationFrame(step);
      });
      frames.shift();
      return frames.sort((a, b) => a - b);
    };
    const quiet = await scroll();
    const quietLong = [...longTasks];
    longTasks.length = 0;
    // Every file asked for at once, as a linked folder now is.
    const { requestCopies } = await import('@/app/soundDirector/libraryDesk');
    await requestCopies({ records: rig.records, library: rig.library, director: rig.director }, rig.library.filesOf('music').map(({ entry }) => ({ ...entry, kind: 'music' as const })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1500)); });
    const states = (): string => `on ${rig!.director.isOn} shelf changes ${rig!.director.snapshot().shelfRevision}`;
    const before = states();
    const busy = await scroll();
    const busyLong = [...longTasks];
    const after = states();
    const p = (sorted: number[], q: number): string => (sorted[Math.floor(sorted.length * q)] ?? 0).toFixed(1);
    const sum = (list: number[]): string => `${list.length} long tasks, worst ${Math.max(0, ...list).toFixed(0)} ms, total ${list.reduce((a, b) => a + b, 0).toFixed(0)} ms`;
    const line = `first rows ${firstRows.toFixed(0)} ms, walked ${walked.toFixed(0)} ms; open: ${sum(openLong)} | quiet scroll median ${p(quiet, 0.5)} p95 ${p(quiet, 0.95)} worst ${p(quiet, 0.999)}; ${sum(quietLong)} | busy scroll median ${p(busy, 0.5)} p95 ${p(busy, 0.95)} worst ${p(busy, 0.999)}; ${sum(busyLong)} | ${before} -> ${after}`;
    observer.disconnect();
    await writeMeasure(`[2,000 tracks] ${line}`);
    expect(firstRows).toBeLessThan(500);
    expect(Number(p(quiet, 0.95))).toBeLessThan(20);
    expect(Number(p(busy, 0.95))).toBeLessThan(20);
    expect(busyLong.filter((ms) => ms > 100)).toEqual([]);
  });

  it('shows the parts a look at the rows leaves out: a selection, its menu, a search, a root not linked here, a skeleton', async () => {
    const r = await open();
    await pressTag('Battle');
    await userEvent.click(rowNamed('Shield wall'));
    await userEvent.click(rowNamed('Under siege'), { modifiers: ['ControlOrMeta'] } as never);
    await settled();
    expect(document.querySelectorAll('.atlas-sound-lib__row[aria-selected="true"]').length).toBeGreaterThan(0);
    rowNamed('Under siege').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 400 }));
    await settled();
    await page.screenshot({ path: `${SHOTS}/library-menu.png`, element: LIBRARY_SHOT(frame!.host) });
    await userEvent.keyboard('{Escape}');
    await settled();
    const search = document.querySelector<HTMLInputElement>('.atlas-sound-lib__search input')!;
    await userEvent.type(search, 'loop 1');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBeGreaterThan(3);
    await settled();
    await page.screenshot({ path: `${SHOTS}/library-search.png`, element: LIBRARY_SHOT(frame!.host) });
    expect(r.director.snapshot().mix.table.music).toBeNull();
  });

  it('a root linked only on another device says so, and its records wait', async () => {
    await page.viewport(1644, 960);
    rig = await mockLibrary({ local: {}, shared: { music: { type: 'external' }, ambience: { type: 'vault', path: 'Audio/Ambience' } } });
    rig.records.add([{ id: 'w1', name: 'Road to Wolfhaven', tags: [], createdAt: 1, modifiedAt: 1, audioPath: 'atlas-sound:music/Road to Wolfhaven.ogg', kind: 'music' }]);
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host, PAGE);
    await settled();
    expect(document.querySelector('.atlas-sound-lib__where')?.textContent).toBe('Not linked on this device');
    await expect.poll(() => rowNamed('Road to Wolfhaven').querySelector('.atlas-sound-lib__state')?.textContent).toBe('Not on this device');
    await page.screenshot({ path: `${SHOTS}/library-not-linked.png`, element: LIBRARY_SHOT(frame.host) });
  });

  it('a root that takes long shows its skeleton in the rows\' places, then its rows without a shift', async () => {
    await page.viewport(1644, 960);
    rig = await mockLibrary();
    const original = rig.locations.music.list.bind(rig.locations.music);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    rig.locations.music.list = async (folder) => {
      await held;
      return original(folder);
    };
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host, PAGE);
    await settled();
    const skeleton = document.querySelector('.atlas-sound-lib__skeleton .atlas-sound-lib__row');
    expect(skeleton?.getBoundingClientRect().height).toBe(38);
    const top = skeleton!.getBoundingClientRect().top;
    expect(document.querySelector('.atlas-sound-lib__none')).toBeNull();
    await page.screenshot({ path: `${SHOTS}/library-skeleton.png`, element: LIBRARY_SHOT(frame.host) });
    release();
    await expect.poll(() => document.querySelector('.atlas-sound-lib__rows [role="row"]')).not.toBeNull();
    expect(document.querySelector('.atlas-sound-lib__rows [role="row"]')!.getBoundingClientRect().top).toBe(top);
  });

  it('hands a 300 MiB file over as a Blob in pieces, keeping the main thread free', async () => {
    const CHUNK = 1024 * 1024;
    const chunk = new Uint8Array(CHUNK);
    const parts: Blob[] = [];
    let longest = 0;
    let last = performance.now();
    const pulse = window.setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 0);
    const start = performance.now();
    for (let index = 0; index < 300; index++) {
      parts.push(new Blob([chunk]));
      await new Promise((resolve) => { window.setTimeout(resolve, 0); });
    }
    const blob = new Blob(parts);
    window.clearInterval(pulse);
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    await writeMeasure(`[blob route] ${blob.size} bytes in ${Math.round(performance.now() - start)} ms, longest gap ${longest.toFixed(1)} ms, JS heap ${memory === undefined ? 'unknown' : Math.round(memory / 1e6)} MB`);
    expect(blob.size).toBe(300 * CHUNK);
    expect(longest).toBeLessThan(50);
  });
});
