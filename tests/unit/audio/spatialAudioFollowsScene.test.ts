import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpatialAudioEngine } from '../../../src/app/audio/SpatialAudioEngine';
import type { AudioBufferCache } from '../../../src/app/audio/AudioBufferCache';
import type { ViewAtlasStore } from '../../../src/app/storeFactory';
import { openStore } from '../../helpers/historyScenes';

/**
 * What the speakers play as the scene changes: a sound added, moved or removed, the listener's
 * token dropped elsewhere or deselected, a wall drawn between, a door opened, undo, and changes
 * that come faster than the engine updates.
 */

/** An audio parameter that keeps the last value it was set or ramped to. */
class Param {
  value = 0;
  linearRampToValueAtTime(value: number): void { this.value = value; }
}

const node = (): { connect: () => void; disconnect: () => void } => ({ connect: (): void => undefined, disconnect: (): void => undefined });

/** The gains and panners the engine makes, in order: the master's gain first, then one of each per sound started. */
let gains: Param[] = [];
let places: Param[] = [];

class Speakers {
  readonly state = 'running';
  readonly currentTime = 0;
  readonly destination = {};
  async resume(): Promise<void> { /* already running */ }
  async close(): Promise<void> { /* nothing held */ }
  createDynamicsCompressor(): object {
    return { ...node(), threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() };
  }
  createGain(): object {
    const gain = new Param();
    gains.push(gain);
    return { ...node(), gain };
  }
  createPanner(): object {
    const positionX = new Param();
    places.push(positionX);
    return { ...node(), positionX, positionY: new Param(), positionZ: new Param() };
  }
  createBufferSource(): object {
    return { ...node(), start: (): void => undefined, stop: (): void => undefined };
  }
}

/** Each sound that plays, by its place right of the listener in 100 px. */
function playing(): number[] {
  return places.filter((_, index) => gains[index + 1]!.value > 0).map((x) => Math.round(x.value * 100) / 100);
}

/** How loud the first sound started plays. */
const loudness = (): number => gains[1]!.value;

let engine: SpatialAudioEngine | null = null;

/** Lets a second pass, as before the next action of a person, with what the engine loads and waits for in it. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1000);
}

const FOUNTAIN = { x: 300, y: 0, innerRadius: 50, outerRadius: 1000, volume: 1, soundId: 'fountain', loop: true };

/** A scene with a listener's token at the origin and the fountain, built by `build` before spatial audio starts; the token is then selected. */
async function listening(build?: (store: ViewAtlasStore) => void): Promise<{ store: ViewAtlasStore; token: string; fountain: string }> {
  const { store } = openStore();
  const token = store.getState().addTokens([{ x: 0, y: 0, imagePath: 'art/listener.png' }])[0]!;
  const fountain = store.getState().addObject('audios', FOUNTAIN);
  build?.(store);
  const cache = { getBuffer: async (): Promise<AudioBuffer> => ({}) as AudioBuffer } as unknown as AudioBufferCache;
  engine = new SpatialAudioEngine(store, cache);
  store.setState({ selectedIds: [token] });
  await settle();
  return { store, token, fountain };
}

beforeEach(() => {
  gains = [];
  places = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  // The page has been open for a while before a scene is opened.
  vi.advanceTimersByTime(1000);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('AudioContext', Speakers);
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('spatial audio follows the scene', () => {

  it('plays a sound in reach of the token selected', async () => {
    await listening();
    expect(playing()).toEqual([3]);
  });

  it('plays a sound added in reach', async () => {
    const { store } = await listening((scene) => scene.getState().removeObjects([Object.keys(scene.getState().objects.audios)[0]!]));
    expect(playing()).toEqual([]);
    store.getState().addObject('audios', { ...FOUNTAIN, x: -200 });
    await settle();
    expect(playing()).toEqual([-2]);
  });

  it('moves a sound that is moved', async () => {
    const { store, fountain } = await listening();
    store.getState().patchObject('audios', fountain, { x: -500 });
    await settle();
    expect(playing()).toEqual([-5]);
  });

  it('stops a sound that is removed', async () => {
    const { store, fountain } = await listening();
    store.getState().removeObjects([fountain]);
    await settle();
    expect(playing()).toEqual([]);
  });

  it('hears from where the listener\'s token is dropped', async () => {
    const { store, token } = await listening();
    store.getState().dropTokens([{ id: token, x: 200, y: 0 }]);
    await settle();
    expect(playing()).toEqual([1]);
  });

  it('muffles a sound behind a wall drawn between', async () => {
    const { store } = await listening();
    const open = loudness();
    store.getState().addObject('walls', { type: 'wall', p1: { x: 150, y: -100 }, p2: { x: 150, y: 100 } });
    await settle();
    expect(loudness()).toBeLessThan(open);
  });

  it('follows one change after another', async () => {
    const { store, token, fountain } = await listening();
    store.getState().patchObject('audios', fountain, { x: 600 });
    await settle();
    expect(playing()).toEqual([6]);
    store.getState().dropTokens([{ id: token, x: 100, y: 0 }]);
    await settle();
    expect(playing()).toEqual([5]);
    store.getState().removeObjects([fountain]);
    await settle();
    expect(playing()).toEqual([]);
    store.temporal.getState().undo();
    await settle();
    expect(playing()).toEqual([5]);
    store.temporal.getState().undo();
    await settle();
    expect(playing().at(-1)).toBe(6);
  });

  it('plays a removed sound again when the removal is undone', async () => {
    const { store } = await listening((scene) => scene.getState().removeObjects([Object.keys(scene.getState().objects.audios)[0]!]));
    expect(playing()).toEqual([]);
    store.temporal.getState().undo();
    await settle();
    expect(playing()).toEqual([3]);
  });

  it('opens up a sound when a door between is opened', async () => {
    const { store } = await listening();
    const door = store.getState().addObject('walls', { type: 'door', closed: true, p1: { x: 150, y: -100 }, p2: { x: 150, y: 100 } });
    await settle();
    const shut = loudness();
    store.getState().toggleDoor(door);
    await settle();
    expect(loudness()).toBeGreaterThan(shut);
  });

  it('stops when the token is deselected and plays again when it is selected', async () => {
    const { store, token } = await listening();
    store.setState({ selectedIds: [] });
    await settle();
    expect(playing()).toEqual([]);
    store.setState({ selectedIds: [token] });
    await settle();
    expect(playing().at(-1)).toBe(3);
  });

  it('plays the last of two changes made in quick succession, and follows changes after them', async () => {
    const { store, fountain } = await listening();
    store.getState().patchObject('audios', fountain, { x: 400 });
    await vi.advanceTimersByTimeAsync(50);
    store.getState().patchObject('audios', fountain, { x: 500 });
    await settle();
    expect(playing()).toEqual([5]);
    store.getState().patchObject('audios', fountain, { x: 600 });
    await settle();
    expect(playing()).toEqual([6]);
  });
});
