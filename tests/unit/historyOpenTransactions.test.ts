import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { openAudioConfigPanel } from '../../src/app/pixi/audio/AudioConfigPanel';
import { useGestureTransactions } from '../../src/app/pixi/lighting/useGestureTransactions';
import { closeStalePopovers } from '../../src/app/pixi/lighting/popoverGuards';
import type { SoundRegistry } from '../../src/app/audio/SoundRegistry';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, runUntracked, type HistoryState } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { genericLight } from '../mocks/lights';
import { setup, teardown } from '../mocks/lightInteractionSetup';

afterEach(teardown);

const registry = { listByCategory: () => ({}) } as unknown as SoundRegistry;
const tokenX = (store: ViewAtlasStore, id: string): number | undefined => store.getState().objects.tokens[id]?.x;

function audioScene(): { store: ViewAtlasStore; history: () => HistoryState; audio: string; piece: string } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `open-transactions-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  const audio = store.getState().addAudio({ x: 0, y: 0, innerRadius: 70, outerRadius: 140, volume: 0.5, soundId: 'fire', loop: true });
  const piece = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/x.png' });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return { store, history: () => history.getState(), audio, piece };
}

const volume = (store: ViewAtlasStore, audio: string): number | undefined => store.getState().objects.audios[audio]?.volume;
const panelSlider = (): HTMLInputElement => document.querySelector<HTMLInputElement>('.atlas-audio-config__slider')!;
const closePanel = (): void => { act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); };

describe('undo and redo while the audio panel holds its edit open', () => {
  it('take back and bring back the panel\'s live edit with the step, as one history', () => {
    const { store, history, audio, piece } = audioScene();
    store.getState().moveToken(piece, 70, 0);
    act(() => openAudioConfigPanel(audio, store, registry));
    act(() => { fireEvent.change(panelSlider(), { target: { value: '80' } }); });
    expect(volume(store, audio)).toBe(0.8);

    history().undo();
    expect([tokenX(store, piece), volume(store, audio)]).toEqual([0, 0.5]);
    history().redo();
    expect([tokenX(store, piece), volume(store, audio)]).toEqual([70, 0.8]);

    closePanel();
    expect(history().pastStates).toHaveLength(2);
    history().undo();
    expect([tokenX(store, piece), volume(store, audio)]).toEqual([70, 0.5]);
    history().undo();
    expect([tokenX(store, piece), volume(store, audio)]).toEqual([0, 0.5]);
  });

  it('takes back a file renamed while the panel was open together with the panel\'s step', () => {
    const { store, history, audio, piece } = audioScene();
    const other = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/y.png' });
    history().clear();
    store.getState().moveToken(piece, 70, 0);
    act(() => openAudioConfigPanel(audio, store, registry));
    runUntracked(store, () => store.getState().retargetRenamedFile('art/y.png', 'art/y2.png'));
    closePanel();
    expect(history().pastStates).toHaveLength(2);
    history().undo();
    expect(store.getState().objects.tokens[other]?.imagePath).toBe('art/y.png');
    expect(tokenX(store, piece)).toBe(70);
  });
});

describe('undo and redo during a light\'s ring drag', () => {
  const bright = (store: ViewAtlasStore, light: string): number | undefined => store.getState().objects.lights[light]?.emission.bright;

  function dragScene(): ReturnType<typeof setup> & { piece: string } {
    const scene = setup();
    const piece = scene.store.getState().addToken({ x: 0, y: 0, imagePath: 'art/x.png' });
    getHistoryStore(scene.store)!.getState().clear();
    scene.store.getState().moveToken(piece, 70, 0);
    return { ...scene, piece };
  }

  it('give the slices of before, and the drag\'s step once the pointer is let go', () => {
    const { store, torch, piece, press, move, up, undo, steps } = dragScene();
    store.getState().openLightPopover(torch);
    press(400, 20);
    move(400, 87);
    expect(bright(store, torch)).toBe(15);
    undo();
    expect([tokenX(store, piece), bright(store, torch)]).toEqual([0, 20]);
    up();
    expect(steps()).toBe(1);
    undo();
    expect([tokenX(store, piece), bright(store, torch)]).toEqual([70, 20]);
  });

  it('bring the drag back with a redo after it was cancelled', () => {
    const { store, torch, piece, lights, press, move } = dragScene();
    store.getState().openLightPopover(torch);
    press(400, 20);
    move(400, 87);
    getHistoryStore(store)!.getState().undo();
    lights.cancel();
    getHistoryStore(store)!.getState().redo();
    expect([tokenX(store, piece), bright(store, torch)]).toEqual([70, 15]);
  });

  it('bring back a light that the undo took away under the drag, as it was dragged', async () => {
    const { store, press, move } = setup();
    const history = getHistoryStore(store)!;
    store.subscribe(closeStalePopovers);
    const lantern = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
    store.getState().openLightPopover(lantern);
    press(400, 20);
    move(400, 87);
    history.getState().undo();
    expect(store.getState().objects.lights[lantern]).toBeUndefined();
    expect(store.getState().lightPopover).toBeNull();
    await Promise.resolve();
    history.getState().redo();
    expect(bright(store, lantern)).toBe(15);
  });
});

describe('undo and redo between the writes of a slider gesture', () => {
  it('give the slices of before after every press', () => {
    const { store, torch, piece } = (() => {
      const scene = setup();
      const piece = scene.store.getState().addToken({ x: 0, y: 0, imagePath: 'art/x.png' });
      getHistoryStore(scene.store)!.getState().clear();
      scene.store.getState().moveToken(piece, 70, 0);
      return { ...scene, piece };
    })();
    const history = getHistoryStore(store)!;
    const at = (): [number | undefined, number | undefined] => [tokenX(store, piece), store.getState().objects.lights[torch]?.emission.bright];
    const setBright = (value: number): void => store.getState().updateLight(torch, { emission: { ...store.getState().objects.lights[torch]!.emission, bright: value } });
    const { result } = renderHook(() => useGestureTransactions(store));
    result.current.onSliderPointerDown({ currentTarget: { ownerDocument: document } } as never);
    setBright(10);
    history.getState().undo();
    expect(at()).toEqual([0, 20]);
    setBright(12);
    history.getState().redo();
    expect(at()).toEqual([70, 10]);
    setBright(14);
    window.dispatchEvent(new Event('pointerup'));
    expect(history.getState().pastStates).toHaveLength(2);
    history.getState().undo();
    expect(at()).toEqual([70, 20]);
    history.getState().undo();
    expect(at()).toEqual([0, 12]);
  });
});
