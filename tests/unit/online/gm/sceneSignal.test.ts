import type { AtlasPlayerSettings } from '../../../../src/app/online/gm/atlasLighting.ts';
import type { ObservedStore, SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { SceneSignal, type SceneChange } from '../../../../src/app/online/gm/sceneSignal.ts';
import { tableControlsStore } from '../../../../src/app/stores/tableControlsStore';
import { afterEach, describe, expect, it } from 'vitest';
import { PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState } from './shareHarness.ts';

/** Listeners as a source keeps them, and a way to tell them all. */
function source(): { readonly follow: (listener: () => void) => () => void; tell(): void; readonly size: () => number } {
  const listeners = new Set<() => void>();
  return {
    follow: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    tell: () => listeners.forEach((listener) => listener()),
    size: () => listeners.size,
  };
}

/** A signal over a store, the renderer's sight, Atlas's settings and one more source of Atlas's, all fake; what it told, in order. */
function signal(initial = sceneState()) {
  let state = initial;
  const storeListeners = new Set<(next: SceneState) => void>();
  const store: ObservedStore = {
    getState: () => state,
    setState: () => undefined,
    subscribe: (listener) => {
      storeListeners.add(listener);
      return () => void storeListeners.delete(listener);
    },
  };
  const sight = source();
  const settingsChanges = source();
  const rules = source();
  let settings: AtlasPlayerSettings = PLAYER_SETTINGS;
  let accent: string | null = '#112233';
  const made = new SceneSignal({ store, sight: sight.follow, settings: { read: () => settings, follow: settingsChanges.follow }, accent: () => accent, atlas: [rules.follow] });
  const told: SceneChange[] = [];
  return {
    made,
    told,
    sight,
    rules,
    listen: () => made.listen((change) => told.push(change)),
    write: (next: SceneState) => {
      state = next;
      storeListeners.forEach((listener) => listener(next));
    },
    /** Tells the store's listeners `held` while the store still gives what it gave, as `PresentedStore` begins a hold. */
    hold: (held: SceneState) => storeListeners.forEach((listener) => listener(held)),
    setSettings: (next: AtlasPlayerSettings) => {
      settings = next;
      settingsChanges.tell();
    },
    setAccent: (next: string) => {
      accent = next;
    },
    followed: () => storeListeners.size + sight.size() + settingsChanges.size() + rules.size(),
  };
}

afterEach(() => {
  tableControlsStore.setState({ paused: false, playMode: 'table' });
});

describe('the one signal for what players see', () => {
  it('tells each store change with the state the store told, a held one too', () => {
    const scene = signal();
    scene.listen();
    const moved = sceneState({ background: 'maps/other.webp' });
    scene.write(moved);
    expect(scene.told).toEqual(['store']);
    expect(scene.made.inputs.state).toBe(moved);
    const held = { ...moved, isMapLoading: true };
    scene.hold(held);
    expect(scene.made.inputs.state).toBe(held);
  });

  it('tells each change of the renderer\'s sight, the inputs as they were', () => {
    const scene = signal();
    scene.listen();
    const before = scene.made.inputs;
    scene.sight.tell();
    expect(scene.told).toEqual(['sight']);
    expect(scene.made.inputs).toBe(before);
  });

  it('reads Atlas again once every part of Atlas told of a change, however many told in one task', async () => {
    const scene = signal();
    scene.listen();
    scene.setAccent('#445566');
    scene.rules.tell();
    scene.rules.tell();
    expect(scene.told).toEqual([]);
    expect(scene.made.inputs.atlas.accent).toBe('#112233');
    await Promise.resolve();
    expect(scene.told).toEqual(['atlas']);
    expect(scene.made.inputs.atlas.accent).toBe('#445566');
  });

  it('reads Atlas\'s settings and the table\'s controls at once: a pause or a switch turned off holds the next request', () => {
    const scene = signal();
    scene.listen();
    scene.setSettings({ ...PLAYER_SETTINGS, playersDraw: true });
    expect(scene.told).toEqual(['atlas']);
    expect(scene.made.inputs.atlas.settings.playersDraw).toBe(true);
    tableControlsStore.setState({ paused: true });
    expect(scene.made.inputs.atlas.paused).toBe(true);
    tableControlsStore.setState({ curtain: true });
    expect(scene.told).toEqual(['atlas', 'atlas']);
  });

  it('gives every player the party\'s picture under Shared vision, and in remote mode, where everyone watches one screen', () => {
    const scene = signal();
    scene.listen();
    expect(scene.made.inputs.atlas.sharedVision).toBe(false);
    tableControlsStore.setState({ playMode: 'remote' });
    expect(scene.made.inputs.atlas.sharedVision).toBe(true);
    tableControlsStore.setState({ playMode: 'table' });
    scene.setSettings({ ...PLAYER_SETTINGS, sharedVision: true });
    expect(scene.made.inputs.atlas.sharedVision).toBe(true);
  });

  it('reads Atlas again as a scene stops loading or being held, after telling the store', async () => {
    const scene = signal();
    scene.listen();
    scene.hold({ ...sceneState(), isMapLoading: true });
    scene.setAccent('#778899');
    scene.write(sceneState());
    expect(scene.told).toEqual(['store', 'store']);
    await Promise.resolve();
    expect(scene.told).toEqual(['store', 'store', 'atlas']);
    expect(scene.made.inputs.atlas.accent).toBe('#778899');
  });

  it('follows its sources only while someone listens, and reads them anew at each look meanwhile', async () => {
    const scene = signal();
    expect(scene.followed()).toBe(0);
    const stop = scene.listen();
    const other = scene.made.listen(() => undefined);
    expect(scene.followed()).toBe(4);
    stop();
    expect(scene.followed()).toBe(4);
    other();
    expect(scene.followed()).toBe(0);
    scene.setAccent('#abcdef');
    expect(scene.made.inputs.atlas.accent).toBe('#abcdef');
    scene.rules.tell();
    await Promise.resolve();
    expect(scene.told).toEqual([]);
  });
});
