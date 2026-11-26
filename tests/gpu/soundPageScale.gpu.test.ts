import { act } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { SoundPane } from '@/app/react/components/dm-screen/sound/SoundPane';
import { DownloadManager } from '@/app/downloads/DownloadManager';
import { MoodStore } from '@/app/soundLibrary/MoodStore';
import type { LibraryRig } from '../helpers/libraryRig';
import { ATLAS_DARK, mockLibrary, settled, stageFrame } from './sound/libraryScene';
import { CommitCounter, frameTimes, measured, nextFrames, quantile, report, reported, type Cost } from './sound/pageMeasure';

/**
 * The Sound page at the size libraries reach: 10,000 tracks over 330 tags and 100 moods, and the 365 tracks of the
 * starter music in its own layout. Every moment a GM waits on is measured (React's commits, long tasks, a CPU
 * profile) and written to `measures.txt`; the budgets hold what the page must never pass.
 */
const OUT = '__screenshots__/sound-scale/measures.txt';
const GENRES = 30;
const SETS = 10;
const TRACKS = 10_000;

const two = (n: number): string => String(n).padStart(2, '0');

function addBigLibrary(rig: LibraryRig): void {
  for (let index = 0; index < TRACKS; index++) {
    const genre = index % GENRES;
    const set = Math.floor(index / GENRES) % SETS;
    rig.locations.music.addFile(`Genre ${two(genre)}/G${two(genre)} Set ${two(set)}/Track ${index}.mp3`, 3_000_000 + index);
  }
}

const PACKS = ['Battle', 'Tavern', 'Travel', 'Wonder', 'Dread', 'Sea', 'Court', 'Wilds', 'Sorrow', 'Feast'];

function addStarterMusic(rig: LibraryRig): void {
  for (let index = 0; index < 365; index++) {
    const pack = PACKS[index % PACKS.length]!;
    const voice = index % 4 === 0 ? 'With vocals' : 'Instrumental';
    rig.locations.music.addFile(`Vindsvept/${pack}/${voice}/Song ${index}.opus`, 4_000_000 + index);
  }
}

function addMoods(rig: LibraryRig, count: number): void {
  const moods = MoodStore.forApp(rig.app);
  for (let index = 0; index < count; index++) {
    moods.createMood({ name: `Mood ${index + 1}`, fadeSeconds: 2, music: 'none', layers: [{ sound: `sound-${index}`, levelDb: -3 }] });
  }
}

const scrollerOf = (selector: string): HTMLElement => {
  for (let element = document.querySelector<HTMLElement>(selector); element; element = element.parentElement) {
    if (element.scrollHeight > element.clientHeight + 1 && getComputedStyle(element).overflowY !== 'visible') return element;
  }
  throw new Error(`Nothing scrolls around ${selector}`);
};

const scrollFrames = (element: HTMLElement, step: number): Promise<number[]> => {
  element.scrollTop = 0;
  const end = element.scrollHeight - element.clientHeight;
  return frameTimes(() => {
    element.scrollTop += step;
    return element.scrollTop < end - 1;
  });
};

const framesLine = (label: string, sorted: number[]): string =>
  `[${label}] frames ${sorted.length}, median ${quantile(sorted, 0.5).toFixed(1)} ms, p95 ${quantile(sorted, 0.95).toFixed(1)} ms, worst ${(sorted.at(-1) ?? 0).toFixed(1)} ms`;

const tagButton = (name: string): HTMLButtonElement => {
  const tag = [...document.querySelectorAll<HTMLButtonElement>('.atlas-sound-lib__tag')].find((one) => one.querySelector('span')?.textContent === name);
  if (!tag) throw new Error(`No tag ${name}`);
  return tag;
};

describe('the Sound page at scale', () => {
  let rig: LibraryRig | null = null;
  let frame: ReturnType<typeof stageFrame> | null = null;
  const commits = new CommitCounter();

  afterEach(() => {
    rig?.unmount();
    rig = null;
    frame?.remove();
    frame = null;
  });

  async function openWith(fill: (opened: LibraryRig) => void, moods = 0): Promise<{ open: Awaited<ReturnType<typeof measured>>; rig: LibraryRig }> {
    await page.viewport(1644, 960);
    rig = await mockLibrary({ seconds: (url) => 60 + (url.length * 37) % 400 });
    fill(rig);
    if (moods > 0) addMoods(rig, moods);
    await MoodStore.forApp(rig.app).whenLoaded();
    frame = stageFrame(ATLAS_DARK);
    const opened = rig;
    // Rendered as Obsidian renders it, outside `act`: effects and transitions take their own frames.
    const first = await measured('open: until the first rows and tiles show', commits, async () => {
      opened.mount(frame!.host, commits.wrap(createElement(SoundPane, { active: true })), true);
      await expect.poll(() => document.querySelector('.atlas-sound-lib__row[role="row"]') !== null && (moods === 0 || document.querySelector('.atlas-sound-mood__press') !== null), { timeout: 30_000, interval: 5 }).toBe(true);
    });
    await report(OUT, first);
    const open = await measured('open: the rest of the first walk', commits, async () => {
      await expect.poll(() => opened.library.isWalked('music') && opened.library.isWalked('ambience'), { timeout: 60_000, interval: 20 }).toBe(true);
      await settled();
    });
    return { open, rig: opened };
  }

  it('opens, filters, searches, sorts and scrolls 10,000 tracks and 100 moods', async () => {
    const { open, rig: opened } = await openWith(addBigLibrary, 100);
    await report(OUT, open);
    expect(document.querySelectorAll('.atlas-sound-mood').length).toBeGreaterThan(0);

    await report(OUT, await measured('press a tag', commits, async () => {
      await userEvent.click(tagButton('Genre 07'));
      await nextFrames();
    }));
    await report(OUT, await measured('press a second tag', commits, async () => {
      await userEvent.click(tagButton('G07 Set 03'));
      await nextFrames();
    }));
    await report(OUT, await measured('back to the root', commits, async () => {
      await userEvent.click(document.querySelector<HTMLButtonElement>('.atlas-sound-lib__root-name')!);
      await nextFrames();
    }));

    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    await report(OUT, await measured('type a search', commits, async () => {
      await userEvent.click(search);
      await userEvent.keyboard('track 12');
      await nextFrames(3);
    }));
    await report(OUT, await measured('clear the search', commits, async () => {
      await userEvent.clear(search);
      await nextFrames(3);
    }));

    const head = (index: number): HTMLButtonElement => document.querySelectorAll<HTMLButtonElement>('.atlas-sound-lib__colheads button')[index]!;
    await report(OUT, await measured('sort by name, reversed', commits, async () => {
      await userEvent.click(head(0));
      await nextFrames();
    }));
    await report(OUT, await measured('sort by length (all 10,000 read)', commits, async () => {
      await userEvent.click(head(1));
      await expect.poll(() => document.querySelector('.atlas-sound-lib__colheads [role="progressbar"]'), { timeout: 60_000, interval: 50 }).toBeNull();
      await nextFrames();
    }));
    await report(OUT, await measured('sort by name again', commits, async () => {
      await userEvent.click(head(0));
      await nextFrames();
    }));

    const list = scrollerOf('.atlas-sound-lib__rows');
    let listFrames: number[] = [];
    await report(OUT, await measured('list scroll', commits, async () => { listFrames = await scrollFrames(list, 400); }));
    await report(OUT, framesLine('list scroll', listFrames));
    const rail = scrollerOf('.atlas-sound-lib__tag');
    const railFrames = await scrollFrames(rail, 120);
    await report(OUT, framesLine(`rail scroll, ${document.querySelectorAll('.atlas-sound-lib__tag').length} tags mounted`, railFrames));
    const moods = scrollerOf('.atlas-sound-mood');
    const moodFrames = await scrollFrames(moods, 60);
    await report(OUT, framesLine(`mood scroll, ${document.querySelectorAll('.atlas-sound-mood').length} tiles mounted`, moodFrames));

    await report(OUT, await measured('a file added', commits, async () => {
      opened.locations.music.addFile('Genre 01/G01 Set 01/Fresh track.mp3');
      await act(async () => { await opened.library.settle('music', ['Genre 01/G01 Set 01/Fresh track.mp3']); });
      await expect.poll(() => opened.library.countOf('music', ''), { interval: 20 }).toBe(TRACKS + 59);
      await settled();
    }));
    await report(OUT, await measured('a mood added', commits, async () => {
      act(() => { MoodStore.forApp(opened.app).createMood({ name: 'One more', fadeSeconds: 2, music: 'none', layers: [] }); });
      await settled();
    }));
    // The downloads button follows its jobs on its own: progress renders it alone, never the library.
    const downloads = await measured('a download in progress', commits, async () => {
      await act(async () => {
        DownloadManager.forApp(opened.app).enqueue({
          id: 'scale-test', title: 'Test pack', origin: 'music-pack', estimate: { bytes: 100_000_000, files: 100 },
          run: async (progress) => {
            progress.expect({ bytes: 100_000_000, files: 100 });
            for (let index = 0; index < 100; index++) {
              await new Promise((resolve) => window.setTimeout(resolve, 20));
              progress.fileDone(1_000_000, true);
            }
          },
        });
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
      });
    });
    await report(OUT, downloads);
    await report(OUT, await measured('idle second', commits, async () => {
      await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 1000)); });
    }));

    // The budgets, in React's development build on a loaded machine (production renders several times faster); the
    // version before these measurements broke each of them. Kept after every report, so a run that fails says all.
    const cost = (label: string): Cost => reported.get(label)!;
    const longTotal = (label: string): number => cost(label).longTasks.reduce((a, b) => a + b, 0);
    expect(longTotal('list scroll'), 'the list scrolls with no frame spent on rows that stood still').toBeLessThan(1000);
    expect(quantile(listFrames, 0.5)).toBeLessThan(30);
    expect(quantile(railFrames, 0.95)).toBeLessThan(20);
    expect(quantile(moodFrames, 0.95)).toBeLessThan(20);
    expect(cost('open: until the first rows and tiles show').worstCommitMs, 'no frame of the opening mounts everything').toBeLessThan(140);
    expect(cost('press a tag').worstCommitMs, 'a tag renders no other tag').toBeLessThan(90);
    expect(cost('a file added').worstCommitMs, 'a file added renders only what it changed').toBeLessThan(160);
    expect(cost('a mood added').worstCommitMs, 'a mood added renders no other tile').toBeLessThan(60);
    expect(downloads.worstCommitMs, 'progress renders the downloads button alone').toBeLessThan(5);
    expect(downloads.hot.some((line) => /LibraryRows? |LibraryView |MoodCard |RailTag /.test(line))).toBe(false);
    expect(cost('idle second').commits).toBe(0);
  });

  it('opens the starter music (365 tracks in packs)', async () => {
    const { open } = await openWith(addStarterMusic, 10);
    await report(OUT, open);
    await report(OUT, await measured('press a pack', commits, async () => {
      await userEvent.click(tagButton('Battle'));
      await nextFrames();
    }));
  });
});
