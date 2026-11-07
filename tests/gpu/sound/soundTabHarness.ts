import type { App } from 'obsidian';
import '../../setup/obsidianDom';
import { act } from '@testing-library/react';
import React, { Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import tone220 from '../../fixtures/sound/tone220-3s.ogg?url';
import tone330 from '../../fixtures/sound/tone330-3s.ogg?url';
import tone220Long from '../../fixtures/sound/tone220-61s.ogg?url';
import toneOpus from '../../fixtures/sound/sources/tone-48k.opus?url';
import toneVorbis from '../../fixtures/sound/sources/tone-48k.ogg?url';
import toneFlac from '../../fixtures/sound/sources/tone-48k.flac?url';
import css from '../../../styles/main.scss?inline';
import DMScreen from '@/app/react/components/DMScreen';
import { AtlasUIContext } from '@/app/react/root/AtlasUIContext';
import { ContextMenuProvider } from '@/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '@/app/react/ViewStoreContext';
import { SettingsService } from '@/app/services/SettingsService';
import { TooltipProvider } from '@/app/packages/components/primitives/tooltip';
import type { Mood, SoundRecord } from '@/app/sound/soundTypes';
import { SoundView } from '@/app/sound-view';
import { SoundDirector } from '@/app/soundDirector/SoundDirector';
import { MoodStore } from '@/app/soundLibrary/MoodStore';
import { recordIdFor } from '@/app/soundLibrary/libraryRecords';
import { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { soundRecordOf } from '@/app/soundLibrary/soundRecords';
import { SoundRecordStore } from '@/app/soundLibrary/SoundRecordStore';
import { createViewAtlasStore, type ViewAtlasStore } from '@/app/storeFactory';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';
import { fakeLibrary, type LibraryRig } from '../../helpers/libraryRig';
import { fillMockLibrary, MOCK_LIBRARY } from './libraryScene';
import { withSound } from '../../mocks/experimentalFeatures';

const SHARED = `
  body { margin: 0; font: var(--font-ui-small)/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text-normal); background: var(--background-secondary);
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px; --corner-shape: squircle;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3;
    --font-normal: 400; --font-medium: 500; --font-semibold: 600; --font-bold: 700; --shadow-l: 0 24px 60px rgba(0, 0, 0, 0.6); --shadow-s: 0 2px 8px rgba(0, 0, 0, 0.3); --color-green: #5cb860; --scrollbar-thumb-bg: rgba(128, 128, 128, 0.3); --scrollbar-active-thumb-bg: rgba(128, 128, 128, 0.5); }
  button, input { corner-shape: var(--corner-shape); font: inherit; color: inherit; }
  button { height: 30px; padding: 4px 12px; border: 0; border-radius: var(--radius-m); background: var(--interactive-normal); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }
  input[type='text'], input[type='search'] { height: 30px; padding: 0 8px; border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); background: var(--background-modifier-form-field); }
`;

export const DARK = `${SHARED}
  body { --mono-100: #fff; --background-primary: #1e1e1e; --background-primary-alt: #242424; --background-secondary: #262626; --background-modifier-border: #363636; --background-modifier-border-focus: #7f6df2;
    --background-modifier-hover: rgba(255, 255, 255, 0.06); --background-modifier-active-hover: rgba(127, 109, 242, 0.15); --background-modifier-form-field: #2a2a2a; --background-modifier-error: #b03a3a; --divider-color: #2f2f2f;
    --interactive-normal: #333; --interactive-accent: #8a7cf0; --text-normal: #dadada; --text-muted: #a8a8a8; --text-faint: #6e6e6e; --text-accent: #a99df5; --text-warning: #e0a750; --text-on-accent: #fff; }`;

export const LIGHT = `${SHARED}
  body { --mono-100: #000; --background-primary: #fff; --background-primary-alt: #fafafa; --background-secondary: #f4f4f4; --background-modifier-border: #e0e0e0; --background-modifier-border-focus: #6a5ce0;
    --background-modifier-hover: rgba(0, 0, 0, 0.05); --background-modifier-active-hover: rgba(106, 92, 224, 0.15); --background-modifier-form-field: #fff; --background-modifier-error: #d04545; --divider-color: #ebebeb;
    --interactive-normal: #fff; --interactive-accent: #6a5ce0; --text-normal: #222; --text-muted: #666; --text-faint: #999; --text-accent: #5a4cd0; --text-warning: #b0761c; --text-on-accent: #fff; }`;

/** The Atlas VTT theme's own values, as the mockup has them. */
export const ATLAS = `${SHARED}
  body { --mono-100: #f0e6d0; --background-primary: #201b15; --background-primary-alt: #262019; --background-secondary: #2b241c; --background-secondary-alt: #322a20; --background-modifier-border: #4a4030; --background-modifier-border-focus: hsl(0, 69%, 57%);
    --background-modifier-hover: rgba(240, 230, 208, 0.06); --background-modifier-active-hover: rgba(240, 230, 208, 0.1); --background-modifier-form-field: #2b241c; --background-modifier-error: #b03a3a; --divider-color: #4a4030;
    --interactive-normal: #2b241c; --interactive-accent: hsl(0, 69%, 57%); --text-normal: #ded2b8; --text-muted: #a89878; --text-faint: #7d6f55; --text-accent: hsl(0, 69%, 67%); --text-warning: #e3b341; --text-on-accent: #fff;
    --h3-font: 'Atlas Fantaisie Artistique'; }`;

/** A sound of the tab: a fixture's URL, or written here in the shape of a real one. */
interface TabSound {
  url?: string;
  /** Seconds of a sound with moments loud and quiet, each seed its own. */
  synth?: { seconds: number; seed: number };
  kind: SoundRecord['kind'];
}

export const SOUNDS: Record<string, TabSound> = {
  Rain: { url: tone220, kind: 'ambience' },
  'Wind in the reeds': { url: tone330, kind: 'ambience' },
  'Campfire crackle': { url: toneOpus, kind: 'ambience' },
  'Tavern crowd': { url: toneVorbis, kind: 'ambience' },
  'Rain on shutters': { synth: { seconds: 4, seed: 11 }, kind: 'ambience' },
  'Night crickets': { synth: { seconds: 4, seed: 12 }, kind: 'ambience' },
  'Distant thunder': { synth: { seconds: 4, seed: 13 }, kind: 'ambience' },
  'Low drone': { synth: { seconds: 4, seed: 14 }, kind: 'ambience' },
  'Road to Wolfhaven': { url: tone220Long, kind: 'music' },
  'The drowned chapel': { url: toneFlac, kind: 'music' },
};

/** A mono 16 bit WAV of noise under a slow swell: enough of a shape for a meter and a waveform. */
function synthWav(seconds: number, seed: number): ArrayBuffer {
  const rate = 48_000;
  const frames = seconds * rate;
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const text = (at: number, value: string): void => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  let state = seed * 16807 + 1;
  let low = 0;
  for (let frame = 0; frame < frames; frame++) {
    state = (state * 16807) % 2147483647;
    low += ((state / 2147483647) * 2 - 1 - low) * 0.05;
    const place = frame / frames;
    const swell = 0.28 + 0.5 * Math.sin(place * Math.PI * (3.2 + seed)) ** 2 + 0.2 * Math.abs(Math.sin(place * 90 + seed));
    view.setInt16(44 + frame * 2, Math.round(Math.max(-1, Math.min(1, low * 4 * swell)) * 26000), true);
  }
  return bytes;
}

export type { TabSound };

export interface SoundTab {
  appId: string;
  /** The in-memory app the page runs on. */
  app: App;
  director: SoundDirector;
  library: SoundLibrary;
  store: ViewAtlasStore;
  records: Map<string, SoundRecord>;
  /** Commits React has made since the last read. */
  commits: { count: number };
  moods: MoodStore;
  moodsOf: () => readonly Mood[];
  /** A record of a file whose bytes never arrive, so its copy stays on its way. */
  addUnfinished(name: string, kind: SoundRecord['kind']): Promise<void>;
  /** The linked folders, with the mock's files, where the tab was opened with them. */
  locations: LibraryRig['locations'] | null;
  unmount: () => void;
}

interface SoundApp {
  app: InMemoryApp['app'];
  stored: SoundRecordStore;
  held: ReturnType<typeof fakeLibrary> | null;
  moods: MoodStore;
  director: SoundDirector;
  records: Map<string, SoundRecord>;
  release: () => void;
  library: SoundLibrary;
}

/** The real director, real copies in IndexedDB and a real context, over an in-memory vault. The theme is the variables Obsidian sets. */
async function soundApp(theme: string, appId: string, sounds: Record<string, TabSound>, linked: boolean): Promise<SoundApp> {
  const style = document.createElement('style');
  style.id = 'sound-tab-theme';
  style.textContent = theme + css;
  document.getElementById('sound-tab-theme')?.remove();
  document.head.append(style);
  document.body.classList.toggle('theme-light', theme === LIGHT);
  document.body.classList.toggle('theme-dark', theme !== LIGHT);

  const paths = Object.fromEntries(Object.keys(sounds).map((name) => [`audio/${name}.ogg`, 'audio']));
  const { app } = createInMemoryApp({ files: paths });
  Object.assign(app, { appId });
  const bytes = new Map<string, ArrayBuffer>();
  for (const [name, { url, synth }] of Object.entries(sounds)) bytes.set(`audio/${name}.ogg`, url ? await (await fetch(url)).arrayBuffer() : synthWav(synth?.seconds ?? 1, synth?.seed ?? 1));
  // A file of no bytes never arrives: its copy stays on its way, and those after it, as copies are made one at a time.
  app.vault.readBinary = vi.fn((file: { path: string }) => {
    const held = bytes.get(file.path);
    return held && held.byteLength > 44 + 2 ? Promise.resolve(held.slice(0)) : new Promise<ArrayBuffer>(() => undefined);
  }) as typeof app.vault.readBinary;

  new SettingsService(app);
  withSound(app);
  const stored = SoundRecordStore.forApp(app);
  await stored.whenLoaded();
  stored.add(Object.entries(sounds).map(([name, { kind }]) => ({ id: recordIdFor(`audio/${name}.ogg`), name, tags: [], createdAt: 1, modifiedAt: 1, audioPath: `audio/${name}.ogg`, kind })));
  await stored.flush();
  const held = linked ? fakeLibrary(app, MOCK_LIBRARY) : null;
  if (held) await fillMockLibrary(held.locations);
  const moods = MoodStore.forApp(app);
  await moods.whenLoaded();
  const director = SoundDirector.forApp(app);
  const records = new Map(stored.all().map(soundRecordOf).map((record) => [record.name, record]));
  const release = (): void => {
    SoundDirector.release(app);
    MoodStore.release(app);
    SoundRecordStore.release(app);
  };
  return { app, stored, held, moods, director, records, release, library: SoundLibrary.forApp(app) };
}

/** The real DM screen on `soundApp`: all that is not Obsidian is the plugin's own. */
export async function openSoundTab(theme: string, viewport: HTMLElement, appId = `sound-tab-${Math.random()}`, sounds: Record<string, TabSound> = SOUNDS, linked = false): Promise<SoundTab> {
  const { app, stored, held, moods, director, records, release, library } = await soundApp(theme, appId, sounds, linked);
  const store = createViewAtlasStore(app, `sound-tab-${Math.random()}`);
  store.setState({ persistenceEnabled: false, isDMScreenOpen: true, dmScreenPage: 'sound', mapPath: 'atlas-vtt/collections/Fen/scenes/a.atlasmap' });
  viewport.className = 'workspace-leaf mod-active';
  viewport.innerHTML = '';
  const host = viewport.createDiv({ cls: 'atlas-vtt-plugin atlas-react-ui-container' });
  host.style.cssText = 'position: absolute; inset: 0';
  const ui = host.createDiv({ cls: 'atlas-ui' });
  ui.style.cssText = 'position: relative; width: 100%; height: 100%';
  const commits = { count: 0 };
  const view = null;
  const root: Root = createRoot(ui);
  act(() => {
    root.render(React.createElement(AtlasUIContext.Provider, { value: { app, view, pixiApp: null, renderer: null } },
      React.createElement(ViewStoreProvider, { store },
        React.createElement(TooltipProvider, null,
          React.createElement(ContextMenuProvider, null,
            React.createElement(Profiler, { id: 'dm', onRender: () => { commits.count++; } },
              React.createElement(DMScreen, { isOpen: true, onClose: () => undefined })))))));
  });
  return {
    appId,
    app,
    director,
    library,
    store,
    records,
    commits,
    moods,
    locations: held?.locations ?? null,
    addUnfinished: async (name, kind) => {
      const audioPath = `audio/${name}.ogg`;
      await app.vault.adapter.write(audioPath, '');
      stored.add([{ id: recordIdFor(audioPath), name, tags: [], createdAt: 1, modifiedAt: 1, audioPath, kind }]);
    },
    moodsOf: () => moods.moods(),
    unmount: () => {
      act(() => root.unmount());
      release();
    },
  };
}

export type SoundViewTab = Pick<SoundTab, 'director' | 'moods' | 'records' | 'unmount'> & { contentEl: HTMLElement };

/** The real tab of its own on `soundApp`, standing in a leaf as Obsidian lays one out, with no map and no store anywhere. */
export async function openSoundView(theme: string, viewport: HTMLElement, sounds: Record<string, TabSound> = SOUNDS): Promise<SoundViewTab> {
  const { app, director, moods, records, release } = await soundApp(theme, `sound-view-${Math.random()}`, sounds, false);
  viewport.className = 'workspace-leaf mod-active';
  viewport.innerHTML = '';
  const view = new SoundView({ app } as never);
  view.containerEl.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%';
  view.contentEl.addClass('view-content');
  view.contentEl.style.cssText = 'flex: 1; min-height: 0';
  view.containerEl.append(view.contentEl);
  viewport.append(view.containerEl);
  await act(async () => { await view.onOpen(); });
  return {
    director,
    moods,
    records,
    contentEl: view.contentEl,
    unmount: () => {
      act(() => { void view.onClose(); });
      release();
    },
  };
}

/** Lays out moods the way a GM's would be, with what they name. */
export function seedMoods(tab: Pick<SoundTab, 'records' | 'moods'>): void {
  const id = (name: string): string => tab.records.get(name)?.id ?? name;
  const moods: Array<[string, Mood['music'], string[]]> = [
    ['Tavern at night', { tracks: [id('Road to Wolfhaven'), id('The drowned chapel')], shuffle: false, levelDb: -3 }, ['Tavern crowd', 'Campfire crackle']],
    ['Rain on the road', { tracks: [id('Road to Wolfhaven')], shuffle: false, levelDb: -6 }, ['Rain', 'Wind in the reeds']],
    ['Sewers', 'none', ['Wind in the reeds']],
    ['Ambush at the bridge', { tracks: [id('The drowned chapel')], shuffle: false, levelDb: 0 }, ['Wind in the reeds']],
    ['Quiet camp', 'keep', ['Campfire crackle']],
    ['The chapel', { tracks: [id('The drowned chapel')], shuffle: false, levelDb: -9 }, ['Rain']],
    ['Market day', { tracks: [id('Road to Wolfhaven')], shuffle: false, levelDb: -6 }, ['Tavern crowd']],
    ['Storm over the fen with a name long enough to take two lines', 'none', ['Rain', 'Wind in the reeds', 'Campfire crackle']],
    ['Lost sound', 'none', ['deleted-sound']],
    ['Boss', { tracks: [id('The drowned chapel')], shuffle: false, levelDb: 0 }, []],
    ['Dawn', 'none', ['Rain']],
  ];
  for (const [name, music, layers] of moods) {
    tab.moods.createMood({ name, fadeSeconds: 2, music, layers: layers.map((layer) => ({ sound: id(layer), levelDb: -3 })) });
  }
}
