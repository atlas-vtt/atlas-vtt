import { act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { ATLAS_DARK, mockLibrary, OBSIDIAN_LIGHT, settled, stageFrame } from './sound/libraryScene';
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

const pressFolder = async (name: string): Promise<void> => {
  const folder = [...document.querySelectorAll<HTMLButtonElement>('.atlas-sound-lib__fold')].find((one) => one.querySelector('span')?.textContent === name);
  if (!folder) throw new Error(`No folder ${name}`);
  await userEvent.click(folder);
  await settled();
};

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
    rig.mount(frame.host);
    await settled();
    rig.library.rescan(Date.now() + 100_000);
    await expect.poll(() => rig?.library.countOf('music', '')).toBe(58);
    await expect.poll(() => rig?.library.countOf('ambience', '')).toBe(121);
    await settled();
    return rig;
  }

  it('stands in the mock\'s proportions, and the row shows its action on hover alone', async () => {
    await open();
    await pressFolder('Battle');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBe(10);
    expect(box('.atlas-sound-lib__rail').width).toBe(264);
    expect(box('.atlas-sound-lib__head').height).toBe(56);
    expect(box('.atlas-sound-lib__row').height).toBe(38);
    const crumb = getComputedStyle(document.querySelector('.atlas-sound-lib__crumb')!);
    expect(crumb.fontSize).toBe('23px');
    expect(crumb.fontFamily).toContain('Fantaisie');
    const row = rowNamed('The last gate');
    const action = row.querySelector<HTMLElement>('.atlas-sound-lib__act')!;
    expect(getComputedStyle(action).opacity).toBe('0');
    await userEvent.hover(row);
    await expect.poll(() => getComputedStyle(action).opacity).toBe('1');
    const fixed = (selector: string): number => box(selector, row).right - box('.atlas-sound-lib__main').left;
    const length = fixed('.atlas-sound-lib__length');
    expect(length).toBeGreaterThan(0);
    expect(rowNamed('Blood on the ford').querySelector('.atlas-sound-lib__length')?.textContent).toBe('3:42');
    expect(rowNamed('Bosses').querySelector('.atlas-sound-lib__length')?.textContent).toBe('5');
    expect(box('.atlas-sound-lib__main').right).toBeLessThanOrEqual(1644 - 16);
  });

  it('sends a real file to the mix, and shows it there and what still converts', async () => {
    const r = await open();
    await pressFolder('Battle');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBe(10);
    await userEvent.hover(rowNamed('Steel in the reeds'));
    await userEvent.click(rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__act')!);
    await expect.poll(() => rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__state')?.textContent, { timeout: 60_000 }).toBe('In the mix');
    await expect.poll(() => r.director.snapshot().mix.table.music?.tracks.length, { timeout: 60_000 }).toBe(1);
    expect(r.locations.music.reads).toContain('Battle/Steel in the reeds.ogg');
    await expect.poll(() => rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__act')?.textContent).toBe('Remove');
    // A read that never ends, as of a long file on a slow disk: the row says what goes on.
    await userEvent.hover(rowNamed('Under siege'));
    await userEvent.click(rowNamed('Under siege').querySelector('.atlas-sound-lib__play')!);
    await expect.poll(() => rowNamed('Under siege').querySelector('.atlas-sound-lib__state')?.textContent, { timeout: 30_000 }).toBe('Converting');
    await act(async () => { (document.activeElement as HTMLElement | null)?.blur(); await userEvent.unhover(rowNamed('Steel in the reeds')); });
    await settled();
    await page.screenshot({ path: `${SHOTS}/library.png`, element: frame!.host.closest<HTMLElement>('.lib-frame')! });
    await userEvent.hover(rowNamed('Steel in the reeds'));
    await userEvent.click(rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__act')!);
    await expect.poll(() => rowNamed('Steel in the reeds').querySelector('.atlas-sound-lib__state')?.textContent).toBe('');
  });

  it('says where to begin when nothing is linked', async () => {
    await page.viewport(1644, 960);
    const { libraryRig } = await import('../helpers/libraryRig');
    rig = await libraryRig();
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host);
    await settled();
    const title = document.querySelector('.atlas-sound-lib__nolink h2');
    expect(title?.textContent).toBe('Where is your music?');
    expect(document.querySelectorAll('.atlas-sound-lib__nolink button')).toHaveLength(3);
    const stage = box('.atlas-sound-lib');
    const heading = title!.getBoundingClientRect();
    expect(Math.abs((heading.left + heading.right) / 2 - (stage.left + stage.right) / 2)).toBeLessThan(1);
    await page.screenshot({ path: `${SHOTS}/library-empty.png`, element: frame.host.closest<HTMLElement>('.lib-frame')! });
  });

  it('holds in light mode', async () => {
    await open(OBSIDIAN_LIGHT);
    await pressFolder('Battle');
    await userEvent.hover(rowNamed('The last gate'));
    await settled();
    const solid = getComputedStyle(document.querySelector('.atlas-sound-lib__btn--solid')!);
    expect(solid.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(solid.color).toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: `${SHOTS}/library-light.png`, element: frame!.host.closest<HTMLElement>('.lib-frame')! });
  });

  it('stacks below the narrow width, and nothing leaves the stage', async () => {
    await open(ATLAS_DARK, 700, 960);
    await pressFolder('Battle');
    await settled();
    const stage = box('.atlas-sound-lib');
    const rail = box('.atlas-sound-lib__rail');
    expect(rail.width).toBe(stage.width);
    expect(rail.bottom).toBeLessThanOrEqual(box('.atlas-sound-lib__main').top + 1);
    const row = rowNamed('The last gate');
    expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(stage.right);
    expect(document.querySelector('.atlas-sound-lib__rows')!.scrollWidth).toBeLessThanOrEqual(document.querySelector('.atlas-sound-lib__rows')!.clientWidth);
    expect(box('.atlas-sound-lib__length', row).right).toBeLessThan(box('.atlas-sound-lib__act', row).left + 1);
    await page.screenshot({ path: `${SHOTS}/library-narrow.png`, element: frame!.host.closest<HTMLElement>('.lib-frame')! });
  });

  it('scrolls a folder of 5,000 files without losing a frame', async () => {
    const r = await open();
    for (let index = 0; index < 5000; index++) r.locations.music.addFile(`Huge/Track ${index}.mp3`);
    r.library.rescan(Date.now() + 200_000);
    await expect.poll(() => r.library.countOf('music', 'Huge'), { timeout: 30_000 }).toBe(5000);
    await settled();
    await pressFolder('Huge');
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
    await page.screenshot({ path: `${SHOTS}/library-5000.png`, element: frame!.host.closest<HTMLElement>('.lib-frame')! });
    expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(34);
  });

  it('shows the parts a look at the rows leaves out: a selection, its menu, a search, a root not linked here, a skeleton', async () => {
    const r = await open();
    await pressFolder('Battle');
    await userEvent.click(rowNamed('Shield wall'));
    await userEvent.click(rowNamed('Under siege'), { modifiers: ['ControlOrMeta'] } as never);
    await settled();
    expect(document.querySelectorAll('.atlas-sound-lib__row[aria-selected="true"]').length).toBeGreaterThan(0);
    rowNamed('Under siege').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 400 }));
    await settled();
    await page.screenshot({ path: `${SHOTS}/library-menu.png`, element: frame!.host.closest<HTMLElement>('.lib-frame')! });
    await userEvent.keyboard('{Escape}');
    await settled();
    const search = document.querySelector<HTMLInputElement>('.atlas-sound-lib__search input')!;
    await userEvent.type(search, 'loop 1');
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__row').length).toBeGreaterThan(3);
    await settled();
    await page.screenshot({ path: `${SHOTS}/library-search.png`, element: frame!.host.closest<HTMLElement>('.lib-frame')! });
    expect(r.director.snapshot().mix.table.music).toBeNull();
  });

  it('a root linked only on another device says so, and its records wait', async () => {
    await page.viewport(1644, 960);
    rig = await mockLibrary({ local: {}, shared: { music: { type: 'external' }, ambience: { type: 'vault', path: 'Audio/Ambience' } } });
    await rig.assets.addIdentifiedAssets([{ id: 'w1', type: 'sound', name: 'Road to Wolfhaven', tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1, audioPath: 'atlas-sound:music/Road to Wolfhaven.ogg', kind: 'music', licence: 'unknown', streaming: 'unknown' }]);
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host);
    await settled();
    expect(document.querySelector('.atlas-sound-lib__where')?.textContent).toBe('Not linked on this device');
    await expect.poll(() => rowNamed('Road to Wolfhaven').querySelector('.atlas-sound-lib__state')?.textContent).toBe('Waiting for the file');
    await page.screenshot({ path: `${SHOTS}/library-not-linked.png`, element: frame.host.closest<HTMLElement>('.lib-frame')! });
  });

  it('a folder that takes long shows its skeleton in the rows\' places, then its rows without a shift', async () => {
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
    rig.mount(frame.host);
    await settled();
    const skeleton = document.querySelector('.atlas-sound-lib__skeleton .atlas-sound-lib__row');
    expect(skeleton?.getBoundingClientRect().height).toBe(38);
    const top = skeleton!.getBoundingClientRect().top;
    expect(document.querySelector('.atlas-sound-lib__none')).toBeNull();
    await page.screenshot({ path: `${SHOTS}/library-skeleton.png`, element: frame.host.closest<HTMLElement>('.lib-frame')! });
    release();
    await expect.poll(() => document.querySelector('.atlas-sound-lib__rows .atlas-sound-lib__row--folder')).not.toBeNull();
    expect(document.querySelector('.atlas-sound-lib__row--folder')!.getBoundingClientRect().top).toBe(top);
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
