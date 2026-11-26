// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

const titles = (host: HTMLElement): (string | null)[] =>
  [...host.querySelectorAll('.atlas-sound-lib__row')].map((row) => row.querySelector('.atlas-sound-lib__title')?.textContent ?? null);
const list = (host: HTMLElement): HTMLElement => host.querySelector<HTMLElement>('.atlas-sound-lib__rows')!;
const head = (host: HTMLElement, word: string): HTMLElement =>
  [...host.querySelectorAll<HTMLElement>('[role="columnheader"]')].find((one) => one.textContent === word)!;
const press = (host: HTMLElement, word: string): void => {
  act(() => { head(host, word).querySelector('button')!.click(); });
};

/** Lengths the test hands out, file by file, as a disk answers in its own time: an answer given before the question waits for it. */
function slowLengths(): { probe: (url: string) => Promise<number | null>; answer: (path: string, seconds: number | null) => void; asked: () => string[] } {
  const waiting = new Map<string, (seconds: number | null) => void>();
  const answers = new Map<string, number | null>();
  return {
    probe: (url) => {
      const path = url.replace('fake://', '');
      return answers.has(path) ? Promise.resolve(answers.get(path) ?? null) : new Promise((done) => waiting.set(path, done));
    },
    answer: (path, seconds) => {
      answers.set(path, seconds);
      act(() => waiting.get(path)?.(seconds));
      waiting.delete(path);
    },
    asked: () => [...waiting.keys()],
  };
}

let rig: LibraryRig;
let host: HTMLElement;
let lengths: ReturnType<typeof slowLengths>;
const FILES = { 'Battle.mp3': 240, 'Calm.mp3': 60, 'Drums.mp3': null, 'Ambush.mp3': 120 };

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  lengths = slowLengths();
  rig = await libraryRig({ local: { music: '/m' }, probe: lengths.probe });
  for (const name of Object.keys(FILES)) rig.locations.music.addFile(`Set/${name}`);
  host = document.body.createDiv();
  rig.mount(host);
  await waitFor(() => expect(titles(host)).toEqual(['Ambush', 'Battle', 'Calm', 'Drums']));
});

afterEach(() => {
  rig.unmount();
  cleanup();
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const answerAll = async (): Promise<void> => {
  for (const [name, seconds] of Object.entries(FILES)) lengths.answer(`Set/${name}`, seconds);
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
};

describe('the heads over the rows', () => {
  it('sort by name, A to Z at first, and turn the order round on a second press', () => {
    expect(head(host, 'Name').getAttribute('aria-sort')).toBe('ascending');
    expect(head(host, 'Length').hasAttribute('aria-sort')).toBe(false);
    press(host, 'Name');
    expect(titles(host)).toEqual(['Drums', 'Calm', 'Battle', 'Ambush']);
    expect(head(host, 'Name').getAttribute('aria-sort')).toBe('descending');
  });

  it('by length keep the rows where they are while the lengths come in, then sort once, the untold last', async () => {
    press(host, 'Length');
    expect(head(host, 'Length').getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(lengths.asked().length).toBe(4));
    lengths.answer('Set/Battle.mp3', 240);
    lengths.answer('Set/Calm.mp3', 60);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(titles(host)).toEqual(['Ambush', 'Battle', 'Calm', 'Drums']);
    await answerAll();
    await waitFor(() => expect(titles(host)).toEqual(['Calm', 'Ambush', 'Battle', 'Drums']));
    expect(head(host, 'Length').getAttribute('aria-sort')).toBe('ascending');
    expect(head(host, 'Length').hasAttribute('aria-busy')).toBe(false);
    press(host, 'Length');
    expect(titles(host)).toEqual(['Battle', 'Ambush', 'Calm', 'Drums']);
  });

  it('are the order Play all plays and a Shift range reaches over, and the choice outlives the view', async () => {
    press(host, 'Length');
    await answerAll();
    await waitFor(() => expect(titles(host)).toEqual(['Calm', 'Ambush', 'Battle', 'Drums']));

    const playList = vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
    vi.spyOn(rig.director, 'tap').mockImplementation(() => undefined);
    act(() => { [...host.querySelectorAll<HTMLButtonElement>('button')].find((one) => one.textContent === 'Play all')!.click(); });
    await waitFor(() => expect(playList).toHaveBeenCalledTimes(1));
    expect(playList.mock.calls[0]?.[0].map((sound) => sound.name)).toEqual(['Calm', 'Ambush', 'Battle', 'Drums']);

    const row = (title: string): Element => [...host.querySelectorAll('.atlas-sound-lib__row')].find((one) => one.querySelector('.atlas-sound-lib__title')?.textContent === title)!;
    act(() => { fireEvent.click(row('Ambush')); });
    act(() => { fireEvent.click(row('Drums'), { shiftKey: true }); });
    const selected = [...host.querySelectorAll('.atlas-sound-lib__row[aria-selected="true"] .atlas-sound-lib__title')].map((one) => one.textContent);
    expect(selected).toEqual(['Ambush', 'Battle', 'Drums']);

    expect(rig.library.sort.current).toEqual({ by: 'length', descending: false });
  });

  it('are reached from the first row with the up arrow, move with left and right, and lead back down', () => {
    list(host).focus();
    act(() => { fireEvent.keyDown(list(host), { key: 'ArrowUp' }); });
    const name = head(host, 'Name').querySelector('button')!;
    expect(host.ownerDocument.activeElement).toBe(name);
    act(() => { fireEvent.keyDown(name, { key: 'ArrowRight' }); });
    expect(host.ownerDocument.activeElement).toBe(head(host, 'Length').querySelector('button'));
    act(() => { fireEvent.keyDown(host.ownerDocument.activeElement!, { key: 'ArrowDown' }); });
    expect(host.ownerDocument.activeElement).toBe(list(host));
  });
});
