import type { App, TFile, Vault } from 'obsidian';
import type { TokenSound } from '../types/audioTypes';
import { MAX_TOKEN_SOUND_BYTES } from './tokenSounds';

/** What became of a sound asked for: it played, or why it did not. */
export type PlayOutcome = 'played' | 'stopped' | 'missing' | 'too-large' | 'unreadable' | 'unavailable';

/** The most decoded sound kept to play again: 32-bit samples of every channel. */
const DECODED_BUDGET_BYTES = 128 * 1024 * 1024;
/** Seconds over which a sound cut off by its restart or by Stop fades, so it ends without a click. */
const CUT_FADE_SECONDS = 0.03;

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

interface Decoded {
  /** The file as it was decoded: a changed file is decoded again. */
  readonly stamp: string;
  readonly buffer: AudioBuffer;
}

const stampOf = (file: TFile): string => `${file.stat.mtime}|${file.stat.size}`;
const bytesOf = (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * 4;

/**
 * Plays tokens' sounds for the GM, on this computer alone. One audio context serves the whole
 * app: made by the click that plays the first sound, since a browser lets sound start from a
 * gesture, and closed when the plugin unloads. A sound being played is in no store and on no
 * event bus, so no other view of the scene, the player window or an online table hears of it,
 * and nothing plays twice.
 *
 * A file has one voice: played while it still plays, it starts again from its beginning. Stop
 * ends every voice and every sound still loading.
 */
export class TokenSoundPlayer {
  private static readonly instances = new WeakMap<App, TokenSoundPlayer>();

  static forApp(app: App): TokenSoundPlayer {
    let player = TokenSoundPlayer.instances.get(app);
    if (!player) {
      player = new TokenSoundPlayer(app.vault);
      TokenSoundPlayer.instances.set(app, player);
    }
    return player;
  }

  static release(app: App): void {
    TokenSoundPlayer.instances.get(app)?.destroy();
    TokenSoundPlayer.instances.delete(app);
  }

  private context: AudioContext | null = null;
  /** The voice of each file that plays now, by vault path. */
  private readonly voices = new Map<string, Voice>();
  /** Decoded files by vault path, the one played longest ago first. */
  private readonly decoded = new Map<string, Decoded>();
  private decodedBytes = 0;
  /** Decodes under way, by path and stamp, so two quick clicks decode a file once. */
  private readonly decoding = new Map<string, Promise<AudioBuffer>>();
  /** Counts the times sounds were stopped: a sound still loading at a stop is not started. */
  private stops = 0;

  private constructor(private readonly vault: Vault) {}

  async play({ path, volume }: Required<TokenSound>): Promise<PlayOutcome> {
    const context = this.audio();
    if (!context) return 'unavailable';
    const file = this.vault.getFileByPath(path);
    if (!file) return 'missing';
    if (file.stat.size > MAX_TOKEN_SOUND_BYTES) return 'too-large';

    const stops = this.stops;
    let buffer: AudioBuffer;
    try {
      buffer = await this.bufferOf(context, file);
    } catch {
      return 'unreadable';
    }
    if (stops !== this.stops) return 'stopped';
    this.start(context, path, buffer, volume);
    return 'played';
  }

  stopAll(): void {
    this.stops += 1;
    for (const path of [...this.voices.keys()]) this.cut(path);
  }

  isPlaying(): boolean {
    return this.voices.size > 0;
  }

  /** The app's audio context, woken if the browser holds it suspended; null where there is no Web Audio. */
  private audio(): AudioContext | null {
    if (!this.context) {
      if (typeof window.AudioContext === 'undefined') return null;
      try {
        this.context = new window.AudioContext();
      } catch {
        return null;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return this.context;
  }

  private bufferOf(context: AudioContext, file: TFile): Promise<AudioBuffer> {
    const stamp = stampOf(file);
    const kept = this.decoded.get(file.path);
    if (kept?.stamp === stamp) {
      // Played again: now the one played most recently.
      this.decoded.delete(file.path);
      this.decoded.set(file.path, kept);
      return Promise.resolve(kept.buffer);
    }
    const key = `${file.path}|${stamp}`;
    let pending = this.decoding.get(key);
    if (!pending) {
      pending = this.decode(context, file, stamp).finally(() => this.decoding.delete(key));
      this.decoding.set(key, pending);
    }
    return pending;
  }

  private async decode(context: AudioContext, file: TFile, stamp: string): Promise<AudioBuffer> {
    const buffer = await context.decodeAudioData(await this.vault.readBinary(file));
    this.keep(file.path, { stamp, buffer });
    return buffer;
  }

  /** Keeps a decoded file within the budget, dropping the files played longest ago to make room. */
  private keep(path: string, entry: Decoded): void {
    const previous = this.decoded.get(path);
    if (previous) {
      this.decoded.delete(path);
      this.decodedBytes -= bytesOf(previous.buffer);
    }
    const bytes = bytesOf(entry.buffer);
    if (bytes > DECODED_BUDGET_BYTES) return;
    this.decoded.set(path, entry);
    this.decodedBytes += bytes;
    for (const [oldest, { buffer }] of this.decoded) {
      if (this.decodedBytes <= DECODED_BUDGET_BYTES) break;
      this.decoded.delete(oldest);
      this.decodedBytes -= bytesOf(buffer);
    }
  }

  private start(context: AudioContext, path: string, buffer: AudioBuffer, volume: number): void {
    this.cut(path);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    const voice: Voice = { source, gain };
    source.onended = (): void => {
      source.disconnect();
      gain.disconnect();
      // A restart has put a new voice in this one's place, which plays on.
      if (this.voices.get(path) === voice) this.voices.delete(path);
    };
    this.voices.set(path, voice);
    source.start();
  }

  /** Fades out and stops the voice of `path`, if it plays. */
  private cut(path: string): void {
    const voice = this.voices.get(path);
    if (!voice || !this.context) return;
    this.voices.delete(path);
    const end = this.context.currentTime + CUT_FADE_SECONDS;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, this.context.currentTime);
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.source.stop(end);
  }

  private destroy(): void {
    this.stopAll();
    this.decoded.clear();
    this.decodedBytes = 0;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
