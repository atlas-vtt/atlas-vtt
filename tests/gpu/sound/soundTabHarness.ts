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
import { AssetService, type NewAsset } from '@/app/services/AssetService';
import { SettingsService } from '@/app/services/SettingsService';
import { TooltipProvider } from '@/app/packages/components/primitives/tooltip';
import type { Mood, SoundRecord } from '@/app/sound/soundTypes';
import { SoundDirector } from '@/app/soundDirector/SoundDirector';
import { MoodStore } from '@/app/soundLibrary/MoodStore';
import { soundRecordsOf } from '@/app/soundLibrary/soundRecords';
import { createViewAtlasStore, type ViewAtlasStore } from '@/app/storeFactory';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { withSound } from '../../mocks/experimentalFeatures';

const SHARED = `
  body { margin: 0; font: var(--font-ui-small)/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text-normal); background: var(--background-secondary);
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px; --corner-shape: squircle;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3; }
  button, input { corner-shape: var(--corner-shape); font: inherit; color: inherit; }
  button { height: 30px; padding: 4px 12px; border: 0; border-radius: var(--radius-m); background: var(--interactive-normal); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }
  input[type='text'], input[type='search'] { height: 30px; padding: 0 8px; border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); background: var(--background-modifier-form-field); }
`;

export const DARK = `${SHARED}
  body { --mono-100: #fff; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636; --background-modifier-border-focus: #7f6df2;
    --background-modifier-hover: rgba(255, 255, 255, 0.06); --background-modifier-active-hover: rgba(127, 109, 242, 0.15); --background-modifier-form-field: #2a2a2a; --background-modifier-error: #b03a3a; --divider-color: #2f2f2f;
    --interactive-normal: #333; --interactive-accent: #8a7cf0; --text-normal: #dadada; --text-muted: #a8a8a8; --text-faint: #6e6e6e; --text-accent: #a99df5; --text-warning: #e0a750; --text-on-accent: #fff; }`;

export const LIGHT = `${SHARED}
  body { --mono-100: #000; --background-primary: #fff; --background-secondary: #f4f4f4; --background-modifier-border: #e0e0e0; --background-modifier-border-focus: #6a5ce0;
    --background-modifier-hover: rgba(0, 0, 0, 0.05); --background-modifier-active-hover: rgba(106, 92, 224, 0.15); --background-modifier-form-field: #fff; --background-modifier-error: #d04545; --divider-color: #ebebeb;
    --interactive-normal: #fff; --interactive-accent: #6a5ce0; --text-normal: #222; --text-muted: #666; --text-faint: #999; --text-accent: #5a4cd0; --text-warning: #b0761c; --text-on-accent: #fff; }`;

export const COLLECTION = 'Fen';

export const SOUNDS: Record<string, { url: string; kind: SoundRecord['kind'] }> = {
  Rain: { url: tone220, kind: 'ambience' },
  'Wind in the reeds': { url: tone330, kind: 'ambience' },
  'Campfire crackle': { url: toneOpus, kind: 'ambience' },
  'Tavern crowd': { url: toneVorbis, kind: 'ambience' },
  'Road to Wolfhaven': { url: tone220Long, kind: 'music' },
  'The drowned chapel': { url: toneFlac, kind: 'music' },
};

export interface SoundTab {
  director: SoundDirector;
  store: ViewAtlasStore;
  records: Map<string, SoundRecord>;
  /** Commits React has made since the last read. */
  commits: { count: number };
  moods: MoodStore;
  moodsOf: () => readonly Mood[];
  unmount: () => void;
}

/**
 * The real DM screen with the real director, real copies in IndexedDB and a real context, over an
 * in-memory vault: all that is not Obsidian is the plugin's own. The theme is the variables Obsidian sets.
 */
export async function openSoundTab(theme: string, viewport: HTMLElement, appId = `sound-tab-${Math.random()}`): Promise<SoundTab> {
  const style = document.createElement('style');
  style.id = 'sound-tab-theme';
  style.textContent = theme + css;
  document.getElementById('sound-tab-theme')?.remove();
  document.head.append(style);

  const paths = Object.fromEntries(Object.keys(SOUNDS).map((name) => [`audio/${name}.ogg`, 'audio']));
  const { app } = createInMemoryApp({ folders: ['atlas-vtt/collections'], files: paths });
  Object.assign(app, { appId });
  const bytes = new Map<string, ArrayBuffer>();
  for (const [name, { url }] of Object.entries(SOUNDS)) bytes.set(`audio/${name}.ogg`, await (await fetch(url)).arrayBuffer());
  app.vault.readBinary = vi.fn((file: { path: string }) => Promise.resolve(bytes.get(file.path)?.slice(0) ?? new ArrayBuffer(0))) as typeof app.vault.readBinary;

  new SettingsService(app);
  withSound(app);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  for (const [name, { kind }] of Object.entries(SOUNDS)) {
    const sound: NewAsset = { type: 'sound', name, tags: [], collection: COLLECTION, audioPath: `audio/${name}.ogg`, kind, licence: 'unknown', streaming: 'unknown' };
    await assets.addAsset(sound);
  }
  const moods = MoodStore.forApp(app);
  await moods.whenLoaded(COLLECTION);
  const director = SoundDirector.forApp(app);
  const records = new Map((await soundRecordsOf(assets, COLLECTION)).map((record) => [record.name, record]));

  const store = createViewAtlasStore(app, `sound-tab-${Math.random()}`);
  store.setState({ persistenceEnabled: false, isDMScreenOpen: true, dmScreenPage: 'sound', mapPath: `atlas-vtt/collections/${COLLECTION}/scenes/a.atlasmap` });
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
    director,
    store,
    records,
    commits,
    moods,
    moodsOf: () => moods.moodsOf(COLLECTION),
    unmount: () => {
      act(() => root.unmount());
      SoundDirector.release(app);
      MoodStore.release(app);
    },
  };
}

/** Lays out moods the way a GM's would be, with what they name. */
export function seedMoods(tab: SoundTab): void {
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
    tab.moods.createMood(COLLECTION, { name, fadeSeconds: 2, music, layers: layers.map((layer) => ({ sound: id(layer), levelDb: -3 })) });
  }
}
