import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TokenSoundPlayer } from '../../src/app/audio/TokenSoundPlayer';
import { FakeAudioContext } from '../mocks/fakeAudioContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MB = 1024 * 1024;

function setup(files: Record<string, string> = {}): { app: App; player: TokenSoundPlayer; context: () => FakeAudioContext } {
  const { app } = createInMemoryApp({
    files: { 'Sounds/roar.mp3': 'audio:48000', 'Sounds/wings.ogg': 'audio:24000', ...files },
  });
  const player = TokenSoundPlayer.forApp(app);
  const context = (): FakeAudioContext => {
    const made = FakeAudioContext.instances.at(-1);
    if (!made) throw new Error('no audio context was made');
    return made;
  };
  return { app, player, context };
}

/** Lets the `ended` events of stopped sources arrive, as the browser sends them a moment later. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  FakeAudioContext.reset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TokenSoundPlayer', () => {
  it('plays a sound through to the speakers at its own volume', async () => {
    const { player, context } = setup();

    expect(await player.play({ path: 'Sounds/roar.mp3', volume: 0.6 })).toBe('played');

    const [source] = context().playing();
    expect(context().playing()).toHaveLength(1);
    expect(source!.buffer?.decodedFrom).toBe('audio:48000');
    expect(context().route(source!)).toEqual({ gain: 0.6, audible: true });
  });

  it('starts a sound again from the beginning when it is played while still playing', async () => {
    const { player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    const first = context().playing()[0];
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await settle();

    expect(first!.stopped).toBe(true);
    expect(context().playing()).toHaveLength(1);
    expect(context().playing()[0]).not.toBe(first);
    expect(player.isPlaying()).toBe(true);
  });

  it('plays different sounds at the same time', async () => {
    const { player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });

    expect(context().playing().map((source) => source.buffer?.decodedFrom)).toEqual(['audio:48000', 'audio:24000']);
  });

  it('is playing until its last sound has ended', async () => {
    const { player, context } = setup();
    expect(player.isPlaying()).toBe(false);

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });
    const [roar, wings] = context().playing();
    roar!.finish();
    expect(player.isPlaying()).toBe(true);
    wings!.finish();

    expect(player.isPlaying()).toBe(false);
    expect(context().route(roar!).audible).toBe(false);
  });

  it('stops every sound at once', async () => {
    const { player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });

    player.stopAll();
    await settle();

    expect(context().playing()).toEqual([]);
    expect(player.isPlaying()).toBe(false);
  });

  it('leaves a sound unplayed that was still loading when sounds were stopped', async () => {
    const { player, context } = setup();

    const playing = player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    player.stopAll();

    expect(await playing).toBe('stopped');
    expect(context().playing()).toEqual([]);
  });

  it('refuses a file larger than 20 MB without decoding it, and plays one of exactly 20 MB', async () => {
    const pad = (size: number): string => 'audio:100'.padEnd(size, ' ');
    const { player, context } = setup({ 'Sounds/album.mp3': pad(20 * MB + 1), 'Sounds/long.mp3': pad(20 * MB) });

    expect(await player.play({ path: 'Sounds/album.mp3', volume: 1 })).toBe('too-large');
    expect(FakeAudioContext.instances.every((made) => made.decodeCount === 0)).toBe(true);
    expect(await player.play({ path: 'Sounds/long.mp3', volume: 1 })).toBe('played');
    expect(context().playing()).toHaveLength(1);
  });

  it('reports a sound whose file is not in the vault', async () => {
    const { player } = setup();
    expect(await player.play({ path: 'Sounds/gone.mp3', volume: 1 })).toBe('missing');
  });

  it('reports a file that is no audio it can decode', async () => {
    const { player, context } = setup({ 'Sounds/notes.mp3': 'not a sound' });

    expect(await player.play({ path: 'Sounds/notes.mp3', volume: 1 })).toBe('unreadable');
    expect(context().playing()).toEqual([]);
  });

  it('decodes a file once while it is unchanged, and again once it changed', async () => {
    const { app, player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    expect(context().decodeCount).toBe(1);

    await app.vault.process(app.vault.getFileByPath('Sounds/roar.mp3')!, () => 'audio:96000');
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    expect(context().decodeCount).toBe(2);
    expect(context().playing()[0]!.buffer?.decodedFrom).toBe('audio:96000');
  });

  it('keeps no more decoded sound than its memory budget, dropping the one played longest ago', async () => {
    // 9,000,000 stereo frames of 32-bit samples are 72 MB decoded: two do not fit in 128 MB.
    const { player, context } = setup({ 'Sounds/a.mp3': 'audio:9000000', 'Sounds/b.mp3': 'audio:9000000' });

    await player.play({ path: 'Sounds/a.mp3', volume: 1 });
    await player.play({ path: 'Sounds/b.mp3', volume: 1 });
    await player.play({ path: 'Sounds/b.mp3', volume: 1 });
    expect(context().decodeCount).toBe(2);

    await player.play({ path: 'Sounds/a.mp3', volume: 1 });
    expect(context().decodeCount).toBe(3);
  });

  it('wakes an audio context the browser started suspended', async () => {
    FakeAudioContext.initialState = 'suspended';
    const { player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    expect(context().state).toBe('running');
    expect(context().playing()).toHaveLength(1);
  });

  it('stays silent where there is no Web Audio', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('AudioContext', undefined);
    const { player } = setup();

    expect(await player.play({ path: 'Sounds/roar.mp3', volume: 1 })).toBe('unavailable');
  });

  it('closes its audio context when the plugin unloads', async () => {
    const { app, player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    TokenSoundPlayer.release(app);

    expect(context().state).toBe('closed');
    expect(TokenSoundPlayer.forApp(app)).not.toBe(player);
  });
});
