// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TokenSoundPlayer } from '../../src/app/audio/TokenSoundPlayer';
import { followOutputDevice, forgetOutputFollower } from '../../src/app/sound/engine/outputDevice';
import { readAudioSecondsAt } from '../../src/app/soundLibrary/audioDuration';
import { FakeTokenSoundContext } from '../helpers/fakeTokenSoundContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/sound/engine/outputDevice', () => ({ followOutputDevice: vi.fn(), forgetOutputFollower: vi.fn() }));
/** How long the files say they play: jsdom loads no audio metadata, so the length is the test's to say. */
const seconds = vi.hoisted(() => ({ value: 5 as number | null }));
vi.mock('../../src/app/soundLibrary/audioDuration', () => ({ readAudioSecondsAt: vi.fn(() => Promise.resolve(seconds.value)) }));

const MB = 1024 * 1024;

function setup(files: Record<string, string> = {}): { app: App; player: TokenSoundPlayer; context: () => FakeTokenSoundContext } {
  const { app } = createInMemoryApp({
    files: { 'Sounds/roar.mp3': 'audio:48000', 'Sounds/wings.ogg': 'audio:24000', ...files },
  });
  const player = TokenSoundPlayer.forApp(app);
  const context = (): FakeTokenSoundContext => {
    const made = FakeTokenSoundContext.instances.at(-1);
    if (!made) throw new Error('no audio context was made');
    return made;
  };
  return { app, player, context };
}

/** The last event of the gain a source plays through: how it is being moved. */
const lastGainEvent = (context: FakeTokenSoundContext, index: number): string | undefined => context.gains[index]?.events.at(-1)?.kind;

beforeEach(() => {
  FakeTokenSoundContext.reset();
  vi.stubGlobal('AudioContext', FakeTokenSoundContext);
  vi.mocked(followOutputDevice).mockClear();
  vi.mocked(forgetOutputFollower).mockClear();
  vi.mocked(readAudioSecondsAt).mockClear();
  seconds.value = 5;
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
    expect(source!.buffer?.length).toBe(48000);
    expect(context().route(source!)).toEqual({ gain: 0.6, audible: true });
  });

  it('puts its context on the chosen output when it makes it', async () => {
    const { player } = setup();
    expect(followOutputDevice).not.toHaveBeenCalled();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });

    expect(followOutputDevice).toHaveBeenCalledOnce();
    expect(followOutputDevice).toHaveBeenCalledWith(FakeTokenSoundContext.instances[0]);
  });

  it('starts a sound again from the beginning when it is played while still playing', async () => {
    const { player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    const first = context().unstopped()[0];
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    expect(first!.stoppedAt).not.toBeNull();
    expect(context().unstopped()).toHaveLength(1);
    expect(context().unstopped()[0]).not.toBe(first);
    expect(player.isPlaying()).toBe(true);
  });

  it('plays different sounds at the same time', async () => {
    const { player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });

    expect(context().playing().map((source) => source.buffer?.length)).toEqual([48000, 24000]);
  });

  it('is playing until its last sound has ended', async () => {
    const { player, context } = setup();
    expect(player.isPlaying()).toBe(false);

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });
    const [roar, wings] = context().playing();
    roar!.onended?.(new Event('ended'));
    expect(player.isPlaying()).toBe(true);
    wings!.onended?.(new Event('ended'));

    expect(player.isPlaying()).toBe(false);
    expect(context().route(roar!).audible).toBe(false);
  });

  it('stops every sound at once', async () => {
    const { player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/wings.ogg', volume: 1 });

    player.stopAll();

    expect(context().unstopped()).toEqual([]);
    expect(player.isPlaying()).toBe(false);
  });

  it('fades stopped sounds out over the seconds asked for', async () => {
    const { player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 0.8 });
    context().currentTime = 3;

    player.stopAll(1.5);

    expect(context().sources[0]!.stoppedAt).toBe(3 + 1.5);
    expect(lastGainEvent(context(), 0)).toBe('curve');
    expect(player.isPlaying()).toBe(false);
  });

  it('cuts with a short fade when no length is asked for', async () => {
    const { player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    context().currentTime = 2;

    player.stopAll();

    expect(context().sources[0]!.stoppedAt).toBeCloseTo(2 + 0.03, 6);
    expect(lastGainEvent(context(), 0)).toBe('curve');
  });

  it('stops the sounds of a player that exists, and makes none where none was made', async () => {
    const { app: fresh } = createInMemoryApp({ files: {} });
    TokenSoundPlayer.stopAllFor(fresh, 2);
    expect(FakeTokenSoundContext.instances).toEqual([]);

    const { app, player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    context().currentTime = 5;

    TokenSoundPlayer.stopAllFor(app, 2);

    expect(context().sources[0]!.stoppedAt).toBe(5 + 2);
    expect(player.isPlaying()).toBe(false);
  });

  it('leaves a sound unplayed that was still loading when sounds were stopped', async () => {
    const { player, context } = setup();

    const playing = player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    player.stopAll();

    expect(await playing).toBe('stopped');
    expect(context().sources).toEqual([]);
  });

  it('refuses a file larger than 20 MB without decoding it, and plays one of exactly 20 MB', async () => {
    const pad = (size: number): string => 'audio:100'.padEnd(size, ' ');
    const { player, context } = setup({ 'Sounds/album.mp3': pad(20 * MB + 1), 'Sounds/long.mp3': pad(20 * MB) });

    expect(await player.play({ path: 'Sounds/album.mp3', volume: 1 })).toBe('too-large');
    expect(FakeTokenSoundContext.instances.every((made) => made.decodeCalls === 0)).toBe(true);
    expect(await player.play({ path: 'Sounds/long.mp3', volume: 1 })).toBe('played');
    expect(context().playing()).toHaveLength(1);
  });

  it('refuses a sound longer than three minutes without decoding it', async () => {
    const { player, context } = setup();
    seconds.value = 181;

    expect(await player.play({ path: 'Sounds/roar.mp3', volume: 1 })).toBe('too-long');
    expect(context().decodeCalls).toBe(0);
    expect(context().sources).toEqual([]);
  });

  it('plays a sound of exactly three minutes', async () => {
    const { player } = setup();
    seconds.value = 180;
    expect(await player.play({ path: 'Sounds/roar.mp3', volume: 1 })).toBe('played');
  });

  it('plays a sound whose length cannot be read', async () => {
    const { player } = setup();
    seconds.value = null;
    expect(await player.play({ path: 'Sounds/roar.mp3', volume: 1 })).toBe('played');
  });

  it('reads the length once for a sound it holds decoded', async () => {
    const { player } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    expect(readAudioSecondsAt).toHaveBeenCalledOnce();
    expect(readAudioSecondsAt).toHaveBeenCalledWith('app://vault/Sounds/roar.mp3');
  });

  it('measures a sound again once its file changed, and refuses it if it grew too long', async () => {
    const { app, player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    await app.vault.process(app.vault.getFileByPath('Sounds/roar.mp3')!, () => 'audio:96000000');
    seconds.value = 400;

    expect(await player.play({ path: 'Sounds/roar.mp3', volume: 1 })).toBe('too-long');
    expect(context().sources).toHaveLength(1);
    expect(context().decodeCalls).toBe(1);
  });

  it('does not start a sound that was being measured when sounds were stopped', async () => {
    const { player, context } = setup();
    let measured: (value: number | null) => void = () => undefined;
    vi.mocked(readAudioSecondsAt).mockReturnValueOnce(new Promise((resolve) => { measured = resolve; }));

    const playing = player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    player.stopAll(2);
    measured(5);

    expect(await playing).toBe('stopped');
    expect(context().sources).toEqual([]);
    expect(context().decodeCalls).toBe(0);
  });

  it('reports a sound whose file is not in the vault', async () => {
    const { player } = setup();
    expect(await player.play({ path: 'Sounds/gone.mp3', volume: 1 })).toBe('missing');
  });

  it('reports a file that is no audio it can decode', async () => {
    const { player, context } = setup({ 'Sounds/notes.mp3': 'not a sound' });

    expect(await player.play({ path: 'Sounds/notes.mp3', volume: 1 })).toBe('unreadable');
    expect(context().sources).toEqual([]);
  });

  it('decodes a file once while it is unchanged, and again once it changed', async () => {
    const { app, player, context } = setup();

    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    expect(context().decodeCalls).toBe(1);

    await app.vault.process(app.vault.getFileByPath('Sounds/roar.mp3')!, () => 'audio:96000');
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });

    expect(context().decodeCalls).toBe(2);
    expect(context().unstopped()[0]!.buffer?.length).toBe(96000);
  });

  it('keeps no more decoded sound than its memory budget, dropping the one played longest ago', async () => {
    // 9,000,000 stereo frames of 32-bit samples are 72 MB decoded: two do not fit in 128 MB.
    const { player, context } = setup({ 'Sounds/a.mp3': 'audio:9000000', 'Sounds/b.mp3': 'audio:9000000' });

    await player.play({ path: 'Sounds/a.mp3', volume: 1 });
    await player.play({ path: 'Sounds/b.mp3', volume: 1 });
    await player.play({ path: 'Sounds/b.mp3', volume: 1 });
    expect(context().decodeCalls).toBe(2);

    await player.play({ path: 'Sounds/a.mp3', volume: 1 });
    expect(context().decodeCalls).toBe(3);
  });

  it('wakes an audio context the browser started suspended', async () => {
    FakeTokenSoundContext.initialState = 'suspended';
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

  it('closes its context and leaves the output when released, even while a sound fades', async () => {
    const { app, player, context } = setup();
    await player.play({ path: 'Sounds/roar.mp3', volume: 1 });
    player.stopAll(2);

    TokenSoundPlayer.release(app);

    expect(forgetOutputFollower).toHaveBeenCalledWith(context());
    expect(context().close).toHaveBeenCalledOnce();
  });
});
