import { DEFAULT_ROOM, type SoundRoom, type TableSound } from '../soundTypes';
import type { SoundContext } from './audioNodes';
import { desiredSound, layerKeyOfVoice, voiceWithoutStart, type DesiredVoice } from './desiredSound';
import { MixerGraph, type LocalLevels } from './mixerGraph';
import { PlayerMeters, type MeterPoint } from './playerMeters';
import { SoundClockMap } from './soundClockMap';
import { SoundSources, type ResolveBytes } from './soundSources';
import { SoundVoice, VOICE_END_SECONDS } from './soundVoice';
import type { WindowDecode } from './windowDecoder';

export interface SoundPlayerOptions {
  context: SoundContext;
  /** The table's clock, in ms. */
  tableNow: () => number;
  /** The bytes of a sound. A promise, a slow read or a failure holds up that sound and nothing else. */
  resolve: ResolveBytes;
  levels?: LocalLevels;
  /** Told when a sound cannot be had; it is tried again every few seconds. */
  onSoundError?: (key: string, error: unknown) => void;
  /** Which decoder long sounds use. Unset: the best this runtime has. */
  windowDecode?: (context: SoundContext) => WindowDecode;
  /** Decoded short sounds no voice uses kept for later; a phone keeps few. */
  spareDecodedBytes?: number;
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
  /** The room last followed, which a state taken away leaves ringing out. */
  private room: SoundRoom = { id: DEFAULT_ROOM, fade: { at: 0, ms: 0 } };
  /** Null but while someone looks at meters, so a player nobody looks at costs nothing for them. */
  private meters: PlayerMeters | null = null;

  constructor(private readonly options: SoundPlayerOptions) {
    this.context = options.context;
    this.levels = options.levels;
    this.graph = new MixerGraph(this.context, this.levels);
    this.sources = new SoundSources(this.context, options.resolve, options.windowDecode ?? null, options.spareDecodedBytes);
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
      const silent = desired.silence.silenced && fadeOver && desired.silence.gain < SILENT_GAIN;
      this.room = desired.room;
      this.graph.followRoom(desired.room, desired.sending && !silent, map);
      if (!silent) {
        for (const voiceWanted of desired.voices) wanted.add(voiceWanted.id);
        for (const voiceWanted of desired.voices) {
          this.carryAcrossRebase(voiceWanted, wanted, map);
          this.voice(voiceWanted.id, voiceWanted.channel).follow(voiceWanted, map);
        }
      }
    }
    // No state: what rang still rings out, and the room goes after.
    if (!this.state) this.graph.followRoom(this.room, false, map);
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
    this.meters?.follow(this.meterPoints());
  }

  /** Starts or ends reading levels. A context that has no analysers has no meters. */
  showMeters(on: boolean): void {
    this.meters?.dispose();
    this.meters = null;
    const createAnalyser = this.context.createAnalyser?.bind(this.context);
    if (!on || !createAnalyser) return;
    this.meters = new PlayerMeters(createAnalyser);
    this.meters.follow(this.meterPoints());
  }

  /** The level of each strip now, linear; nothing while no meters show. */
  readMeters(into: Map<string, number>): void {
    if (this.meters) this.meters.read(into, this.graph.silenceAt(this.context.currentTime));
    else into.clear();
  }

  setLocalLevels(levels: LocalLevels): void {
    this.levels = levels;
    this.graph.setLocalLevels(levels);
  }

  /** Keys of the sounds a voice is waiting for: the bytes are still on their way or could not be had. */
  waitingKeys(): string[] {
    return [...new Set([...this.voices.values()].flatMap((voice) => voice.waitingKeys))];
  }

  /** Reads a sound's bytes anew from now on: its copy, made while it played, is stored. */
  forgetSource(key: string): void {
    this.sources.forget(key);
  }

  /** What whole decoded sounds hold now; a long sound's windows are about 8 MB per voice besides. */
  decodedBytes(): number {
    return this.sources.decodedBytes();
  }

  /** Resolves once everything asked for so far has been read and decoded, and is in place. */
  async settled(): Promise<void> {
    await this.sources.settled();
    this.tick();
  }

  /** Moves to a new context, after a rebuild: everything comes back from the state, in its place. */
  useContext(context: SoundContext): void {
    const metered = this.meters !== null;
    this.showMeters(false);
    this.dropAll();
    this.graph.disconnect();
    this.context = context;
    this.sources.useContext(context);
    this.graph = new MixerGraph(context, this.levels);
    this.tick();
    this.showMeters(metered);
  }

  dispose(): void {
    this.showMeters(false);
    this.state = null;
    this.dropAll();
    this.graph.disconnect();
  }

  private meterPoints(): Map<string, MeterPoint> {
    const points = new Map<string, MeterPoint>([
      ['music', { strip: 'music', node: this.graph.input('music'), afterSilence: true }],
      ['master', { strip: 'master', node: this.graph.output, afterSilence: true }],
    ]);
    for (const [id, voice] of this.voices) {
      const key = layerKeyOfVoice(id);
      if (key !== null) points.set(id, { strip: key, node: voice.output, afterSilence: false });
    }
    return points;
  }

  /** A state moved onto another clock names every voice anew, though each still starts on the same frame: that voice goes on, with no hole. */
  private carryAcrossRebase(desired: DesiredVoice, wanted: ReadonlySet<string>, map: SoundClockMap): void {
    if (this.voices.has(desired.id)) return;
    const stem = voiceWithoutStart(desired.id);
    const ctxFrame = map.ctxFrameOf(desired.startAt);
    for (const [id, voice] of this.voices) {
      if (wanted.has(id) || voiceWithoutStart(id) !== stem || !voice.startsAt(ctxFrame, map.rate)) continue;
      this.voices.delete(id);
      this.voices.set(desired.id, voice);
      return;
    }
  }

  private voice(id: string, channel: 'music' | 'ambience'): SoundVoice {
    let voice = this.voices.get(id);
    if (!voice) {
      voice = new SoundVoice({
        context: this.context,
        sources: this.sources,
        input: this.graph.input(channel),
        send: this.graph.sendInput(channel),
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
