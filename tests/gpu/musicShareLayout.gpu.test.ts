import '../setup/obsidianDom';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  for (const theme of ['dark', 'light'] as const) {
    it(`lays out the music step's tracks in rows of one height, scrolling inside the list (${theme})`, async () => {
      document.body.className = `theme-${theme}`;
      const listeners = new Map<string, (state: PreparedTrack) => void>();
      const session = new MusicShareSession({
        account: AtlasAccount.forApp(app)!, api: new MusicArmarium(), kind: 'music-album', files: TITLES.map(fileOf), name: 'Old Roads',
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
      act(() => {
        [...listeners.values()].forEach((tell, index) => tell(index === 3 ? { state: 'refused', reason: 'consent' } : index === 5 ? { state: 'converting', progress: 0.42 } : { state: 'ready', copy: new Blob(['x'.repeat(3_000_000)]), frames: 48_000 * (120 + index * 17) }));
      });
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
        seconds: 3000, bytes: 36_000_000, where: ['Music', 'Mara', 'Old Roads'], update: { from: 2, replaced: 9, added: 3, removed: 1, kept: 1 }, same: false,
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
