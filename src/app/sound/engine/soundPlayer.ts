import type { TableSound } from '../soundTypes';
import type { SoundContext } from './audioNodes';
import { desiredSound } from './desiredSound';
import { MixerGraph, type LocalLevels } from './mixerGraph';
import { SoundClockMap } from './soundClockMap';
import { SoundSources, type ResolveBytes } from './soundSources';
import { SoundVoice, VOICE_END_SECONDS } from './soundVoice';
import type { WindowDecode } from './windowDecoder';

export type { LocalLevels } from './mixerGraph';

export interface SoundPlayerOptions {
  context: SoundContext;
  /** The table's clock, in ms. */
  tableNow(): number;
  /** The bytes of a sound. A promise, a slow read or a failure holds up that sound and nothing else. */
  resolve: ResolveBytes;
  levels?: LocalLevels;
  /** Told when a sound cannot be had; it is tried again every few seconds. */
  onSoundError?(key: string, error: unknown): void;
  /** Which decoder long sounds use. Unset: the best this runtime has. */
  windowDecode?(context: SoundContext): WindowDecode;
}

/** Below this the Silence fade is over and nothing need play. */
const SILENT_GAIN = 1e-6;

/**
 * Makes the audio graph follow a table's sound. Give it each new state and tick it (a few times a second,
 * and from the owner's own timer, not a renderer's); everything it does follows from the state and the
 * clock, so a late join, a reconnect and a returning tab need nothing of their own. It never starts or
 * resumes the context: that belongs to the gesture and the watchdog.
 */
export class SoundPlayer {
  private context: SoundContext;
  private graph: MixerGraph;
  private readonly sources: SoundSources;
  private state: TableSound | null = null;
  private readonly voices = new Map<string, SoundVoice>();
  /** Voices fading out, with the context time to let go of them at. */
  private ending: Array<{ voice: SoundVoice; at: number }> = [];
  private levels: LocalLevels | undefined;

  constructor(private readonly options: SoundPlayerOptions) {
    this.context = options.context;
    this.levels = options.levels;
    this.graph = new MixerGraph(this.context, this.levels);
    this.sources = new SoundSources(this.context, options.resolve, options.windowDecode ?? null);
  }

  /** Takes a state, whole; giving the same one again changes nothing. */
  setState(state: TableSound | null): void {
    this.state = state;
    this.tick();
  }

  tick(): void {
    const map = new SoundClockMap(this.context.currentTime, this.options.tableNow(), this.context.sampleRate);
    const wanted = new Set<string>();
    if (this.state) {
      const desired = desiredSound(this.state, map.tableMs);
      this.graph.followSilence(desired.silence, map);
      const fadeOver = map.tableMs >= desired.silence.fade.at + desired.silence.fade.ms;
      // Silent for good: nothing plays, and coming back lands where it would have been anyway.
      if (!(desired.silence.silenced && fadeOver && desired.silence.gain < SILENT_GAIN)) {
        for (const voiceWanted of desired.voices) {
          wanted.add(voiceWanted.id);
          this.voice(voiceWanted.id, voiceWanted.channel).follow(voiceWanted, map);
        }
      }
    }
    for (const [id, voice] of this.voices) {
      if (wanted.has(id)) continue;
      voice.end(map);
      this.voices.delete(id);
      this.ending.push({ voice, at: map.ctxSeconds + VOICE_END_SECONDS * 4 });
    }
    this.ending = this.ending.filter(({ voice, at }) => {
      if (at > map.ctxSeconds) return true;
      voice.dispose();
      return false;
    });
  }

  setLocalLevels(levels: LocalLevels): void {
    this.levels = levels;
    this.graph.setLocalLevels(levels);
  }

  /** Keys of the sounds a voice is waiting for: the bytes are still on their way or could not be had. */
  waitingKeys(): string[] {
    return [...new Set([...this.voices.values()].flatMap((voice) => voice.waitingKeys))];
  }

  /** Resolves once everything asked for so far has been read and decoded, and is in place. */
  async settled(): Promise<void> {
    await this.sources.settled();
    this.tick();
  }

  /** Moves to a new context, after a rebuild: everything comes back from the state, in its place. */
  useContext(context: SoundContext): void {
    this.dropAll();
    this.graph.disconnect();
    this.context = context;
    this.sources.useContext(context);
    this.graph = new MixerGraph(context, this.levels);
    this.tick();
  }

  dispose(): void {
    this.state = null;
    this.dropAll();
    this.graph.disconnect();
  }

  private voice(id: string, channel: 'music' | 'ambience'): SoundVoice {
    let voice = this.voices.get(id);
    if (!voice) {
      voice = new SoundVoice({
        context: this.context,
        sources: this.sources,
        input: this.graph.input(channel),
        onError: (key, error) => this.options.onSoundError?.(key, error),
      });
      this.voices.set(id, voice);
    }
    return voice;
  }

  private dropAll(): void {
    for (const voice of this.voices.values()) voice.dispose();
    for (const { voice } of this.ending) voice.dispose();
    this.voices.clear();
    this.ending = [];
  }
}
