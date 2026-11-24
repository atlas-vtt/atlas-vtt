import '../setup/obsidianDom';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { AtlasAccount } from '../../src/app/account/AtlasAccount';
import { ArmariumShareLayer } from '../../src/app/armarium/share/ArmariumShareLayer';
import { MusicShareSession, type PreparedTrack } from '../../src/app/armarium/upload/MusicShareSession';
import type { OwnListing } from '../../src/app/armarium/upload/uploadContract';
import { MusicReviewDialog } from '../../src/app/packages/components/asset-manager/collection-transfer/MusicReviewDialog';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import type { MusicReview } from '../../src/app/services/musicBundle/musicImport';
import type { LibraryFile } from '../../src/app/soundLibrary/SoundLibrary';
import { sha256 } from '../../src/app/utils/hashing';
import { FakeArmarium, noSleep, settle } from '../unit/armarium/shareFakes';
import { DASHBOARD_THEME } from './dashboardTheme';
import { mouse } from './realMouse';

/**
 * The music step of a share and the music review, laid out with the plugin's stylesheet: rows of one height with their
 * parts on one line, a long album scrolling inside its list while the dialog keeps its size, square cover cards.
 * Screenshots go to `__screenshots__/armarium-music/`.
 */

const SHOT_DIR = '__screenshots__/armarium-music';
const PX = 1;
const app = {} as App;
const TITLES = ['Dawn over the Moor', 'The Drowned Bell', 'Lanterns', 'Old Roads', 'A Very Long Title That Goes On Past Where Any Row Could Hold It Whole', 'Hearth', 'Night Watch', 'Embers', 'The Ferryman', 'Last Light', 'Fog', 'Home'];

class MusicArmarium extends FakeArmarium {
  listings: OwnListing[] = [{ uid: 'a'.repeat(32), slug: 'old-roads', name: 'Old Roads', format: 'music-album', fields: null, newestVersion: 2, coverUrl: null }];
  ownListings(): Promise<OwnListing[]> {
    return Promise.resolve(this.listings);
  }
}

const fileOf = (title: string, index: number): LibraryFile => ({ kind: 'music', path: `Old Roads/${String(index + 1).padStart(2, '0')} ${title}.mp3`, name: `${String(index + 1).padStart(2, '0')} ${title}.mp3`, size: 10, mtime: 1 });

const box = (selector: string): DOMRect => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`${selector} did not render`);
  return element.getBoundingClientRect();
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** A frame later, once every running animation (the dialog's opening, the art fading in) has ended. */
async function settled(): Promise<void> {
  await nextFrame();
  await Promise.all(document.getAnimations().map((animation) => animation.finished));
}

describe('music in the Armarium', () => {
  const style = document.createElement('style');
  style.textContent = `${DASHBOARD_THEME}${css}`;
  let host: HTMLElement;
  let root: Root;
  let token: string | null;

  beforeEach(async () => {
    await page.viewport(1280, 820);
    document.head.append(style);
    document.body.className = 'theme-dark';
    host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    root = createRoot(host);
    token = 'tok';
    AtlasAccount.open(app, {
      http: () => Promise.resolve({ status: 200, json: { user: { id: 'acct-1', name: 'Mara', handle: 'mara' } } }),
      timers: { now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
      tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
      available: true,
      openUrl: () => undefined,
      notify: () => undefined,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    style.remove();
    document.body.className = '';
    AtlasAccount.release(app);
  });

  /** The share dialog at its music step with `titles` as an album, each track told `told(index)`. */
  async function showMusicStep(titles: readonly string[], told: (index: number) => PreparedTrack, artist = ''): Promise<MusicShareSession> {
    const listeners = new Map<string, (state: PreparedTrack) => void>();
    const session = new MusicShareSession({
      account: AtlasAccount.forApp(app)!, api: new MusicArmarium(), kind: 'music-album', files: titles.map(fileOf), name: 'Old Roads',
      prepare: (file, listener) => {
        listeners.set(file.path, listener);
        return () => undefined;
      },
      newUid: () => 'f'.repeat(32),
      pack: () => Promise.resolve({ fileName: 'x.zip', blob: new Blob(['zip']) }),
      fetchCover: () => Promise.resolve(null), sha256: (bytes) => sha256(bytes), sleep: noSleep,
    });
    act(() => root.render(React.createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
      React.createElement(ArmariumShareLayer, { session, onClose: () => undefined }))));
    await act(async () => {
      session.start();
      await settle();
    });
    act(() => [...listeners.values()].forEach((tell, index) => tell(told(index))));
    if (artist) act(() => session.setArtist(artist));
    return session;
  }

  const ready = (): PreparedTrack => ({ state: 'ready', copy: new Blob(['x']), frames: 48_000 * 120 });

  it('keeps the cover cards where they are while a cover or No cover is chosen', async () => {
    const session = await showMusicStep(TITLES.slice(0, 3), ready);
    await settled();
    const cards = (): number => box('.atlas-transfer-covers__list').top;
    const before = cards();
    act(() => session.uploadCover(new Blob(['png'], { type: 'image/png' })));
    await settled();
    expect(cards()).toBe(before);
    act(() => session.setCover(null));
    await settled();
    expect(cards()).toBe(before);
  });

  it('gives What changed the room of its rows, and ends a long artist in the hero with an ellipsis', async () => {
    const session = await showMusicStep(TITLES.slice(0, 3), ready, 'The Very Long Name of an Ensemble That Plays Old Songs of the Road at Night');
    await act(async () => {
      session.chooseListing('a'.repeat(32));
      await settle();
    });
    await nextFrame();
    const notes = document.querySelector<HTMLTextAreaElement>('.atlas-share-field__text')!;
    expect(notes.rows).toBe(4);
    expect(notes.clientHeight).toBeGreaterThanOrEqual(4 * parseFloat(getComputedStyle(notes).lineHeight));
    const [artist, kind] = Array.from(document.querySelectorAll<HTMLElement>('.atlas-transfer-hero__detail'));
    expect(getComputedStyle(artist!).textOverflow).toBe('ellipsis');
    expect(artist!.scrollWidth).toBeGreaterThan(artist!.clientWidth);
    // The kind keeps its separator and stays on the artist's line.
    expect(Math.abs(kind!.getBoundingClientRect().top - artist!.getBoundingClientRect().top)).toBeLessThanOrEqual(PX);
  });

  it('scrolls the dialog with the wheel over a track list that has nothing to scroll', async () => {
    await page.viewport(1280, 520);
    await showMusicStep(TITLES.slice(0, 3), () => ({ state: 'ready', copy: new Blob(['x']), frames: 48_000 * 120 }));
    await nextFrame();
    await nextFrame();
    const list = document.querySelector<HTMLElement>('.atlas-music-tracks')!;
    expect(list.scrollHeight).toBeLessThanOrEqual(list.clientHeight);
    let scroller = list.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && getComputedStyle(scroller).overflowY !== 'visible')) scroller = scroller.parentElement;
    expect(scroller, 'the dialog has room to scroll at this height').not.toBeNull();
    // Scrolled to its end, where the list shows; the wheel upwards over the list then scrolls the dialog back.
    scroller!.scrollTop = scroller!.scrollHeight;
    await nextFrame();
    const end = scroller!.scrollTop;
    const shown = list.getBoundingClientRect();
    const view = scroller!.getBoundingClientRect();
    const y = (Math.max(shown.top, view.top) + Math.min(shown.bottom, view.bottom)) / 2;
    expect(document.elementFromPoint(shown.left + shown.width / 2, y)?.closest('.atlas-music-tracks')).toBe(list);
    await mouse.wheel(shown.left + shown.width / 2, y, -200);
    await vi.waitFor(() => expect(scroller!.scrollTop).toBeLessThan(end));
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`lays out the music step's tracks in rows of one height, scrolling inside the list (${theme})`, async () => {
      document.body.className = `theme-${theme}`;
      await showMusicStep(TITLES, (index) => (index === 3 ? { state: 'refused', reason: 'consent' } : index === 5 ? { state: 'converting', progress: 0.42 } : { state: 'ready', copy: new Blob(['x'.repeat(3_000_000)]), frames: 48_000 * (120 + index * 17) }));
      await nextFrame();
      await nextFrame();
      const dialog = box('.atlas-transfer-dialog');
      const list = document.querySelector<HTMLElement>('.atlas-music-tracks')!;
      const rows = Array.from(list.querySelectorAll<HTMLElement>('.atlas-music-track'));
      expect(rows).toHaveLength(TITLES.length);
      const heights = new Set(rows.map((row) => Math.round(row.getBoundingClientRect().height)));
      expect(heights.size).toBe(1);
      // Every part of a row on its one line: grip, number, title, state, the ×.
      for (const row of rows) {
        const middle = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
        for (const part of Array.from(row.children) as HTMLElement[]) {
          const rect = part.getBoundingClientRect();
          if (rect.height === 0) continue;
          expect(Math.abs(rect.top + rect.height / 2 - middle)).toBeLessThanOrEqual(PX);
        }
      }
      // A long album scrolls inside its list; nothing spills sideways.
      expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
      expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + PX);
      expect(box('.atlas-music-tracks').right).toBeLessThanOrEqual(dialog.right);
      // Square cover cards.
      const card = box('.atlas-transfer-covers[data-shape="square"] .atlas-transfer-cover-card');
      expect(Math.abs(card.width - card.height)).toBeLessThanOrEqual(PX);
      await page.screenshot({ path: `${SHOT_DIR}/music-step-${theme}.png`, element: document.querySelector<HTMLElement>('.atlas-transfer-dialog')! });
    });

    it(`shows the music review with its tracks, where they go and what an update does (${theme})`, async () => {
      document.body.className = `theme-${theme}`;
      const review: MusicReview = {
        kind: 'music-album', name: 'Old Roads', artist: 'Mara', version: 3, creator: 'Lio', cover: null, notes: 'Two new songs, and Lanterns plays a little slower.',
        tracks: TITLES.map((title, index) => ({ title, seconds: 120 + index * 17, bytes: 3_000_000 })),
        seconds: 3000, bytes: 36_000_000, where: ['Music', 'Mara', 'Old Roads'], update: { from: 2, replaced: 9, renamed: 0, unchanged: 0, added: 3, removed: 1, kept: 1 }, same: false,
      };
      act(() => root.render(React.createElement(MusicReviewDialog, { review, onConfirm: () => undefined, onCancel: () => undefined })));
      await nextFrame();
      await nextFrame();
      const list = document.querySelector<HTMLElement>('.atlas-music-tracks')!;
      expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + PX);
      const rows = Array.from(list.querySelectorAll<HTMLElement>('.atlas-music-track'));
      expect(new Set(rows.map((row) => Math.round(row.getBoundingClientRect().height))).size).toBe(1);
      await page.screenshot({ path: `${SHOT_DIR}/music-review-${theme}.png`, element: document.querySelector<HTMLElement>('.atlas-transfer-dialog')! });
    });
  }
});
