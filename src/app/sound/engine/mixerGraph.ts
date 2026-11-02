import type { SoundContext, SoundGainNode, SoundNode } from './audioNodes';
import type { DesiredSilence, VoiceChannel } from './desiredSound';
import { GainTrack } from './gainTrack';
import type { SoundClockMap } from './soundClockMap';
import { dbToGain, fadeProgress } from './soundMath';

/** The listener's own levels, never part of the table's state. -Infinity is off. */
export interface LocalLevels {
  musicDb: number;
  ambienceDb: number;
  masterDb: number;
}

const FULL_LEVELS: LocalLevels = { musicDb: 0, ambienceDb: 0, masterDb: 0 };

interface Stage {
  node: SoundGainNode;
  track: GainTrack;
}

function stage(context: SoundContext, initial: number): Stage {
  const node = context.createGain();
  return { node, track: new GainTrack(node.gain, initial) };
}

/**
 * `voices → musicGm → musicLocal → master → compressor → output`, and likewise for ambience. `*Gm` follows
 * the shared state, which is the Silence fade; `*Local` and master are the listener's. The compressor is
 * only a safety: mixes stay below its threshold.
 */
export class MixerGraph {
  private readonly stages: Stage[] = [];
  private readonly musicGm: Stage;
  private readonly ambienceGm: Stage;
  private readonly musicLocal: Stage;
  private readonly ambienceLocal: Stage;
  private readonly master: Stage;
  private readonly compressor: SoundNode;
  private silenceKey: string | null = null;

  constructor(private readonly context: SoundContext, levels: LocalLevels = FULL_LEVELS) {
    this.musicGm = this.addStage(1);
    this.ambienceGm = this.addStage(1);
    this.musicLocal = this.addStage(dbToGain(levels.musicDb));
    this.ambienceLocal = this.addStage(dbToGain(levels.ambienceDb));
    this.master = this.addStage(dbToGain(levels.masterDb));
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -1;
    compressor.knee.value = 0;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    this.compressor = compressor;
    this.musicGm.node.connect(this.musicLocal.node);
    this.ambienceGm.node.connect(this.ambienceLocal.node);
    this.musicLocal.node.connect(this.master.node);
    this.ambienceLocal.node.connect(this.master.node);
    this.master.node.connect(compressor);
    compressor.connect(context.destination);
  }

  input(channel: VoiceChannel): SoundGainNode {
    return channel === 'music' ? this.musicGm.node : this.ambienceGm.node;
  }

  /** The mix past every fader, before the compressor. */
  get output(): SoundNode {
    return this.master.node;
  }

  /** What the Silence fade lets through at a context time. */
  silenceAt(time: number): number {
    return this.ambienceGm.track.valueAt(time);
  }

  setLocalLevels(levels: LocalLevels): void {
    const now = this.context.currentTime;
    this.musicLocal.track.move(dbToGain(levels.musicDb), now, 0);
    this.ambienceLocal.track.move(dbToGain(levels.ambienceDb), now, 0);
    this.master.track.move(dbToGain(levels.masterDb), now, 0);
  }

  followSilence(silence: DesiredSilence, map: SoundClockMap): void {
    const key = `${silence.silenced}|${silence.fade.at}|${silence.fade.ms}`;
    if (key === this.silenceKey) return;
    const first = this.silenceKey === null;
    this.silenceKey = key;
    const to = silence.silenced ? 0 : 1;
    for (const { track } of [this.musicGm, this.ambienceGm]) followFade(track, first, to, silence.silenced ? 1 : 0, silence.fade, map);
  }

  disconnect(): void {
    for (const { node } of this.stages) node.disconnect();
    this.compressor.disconnect();
  }

  private addStage(initial: number): Stage {
    const made = stage(this.context, initial);
    this.stages.push(made);
    return made;
  }
}

/**
 * Takes a gain to `to` on a fade: from the fade's own start for one that comes to it late, and from
 * wherever it is for one already running. A fade that is over only leaves a short fader.
 */
export function followFade(track: GainTrack, first: boolean, to: number, from: number, fade: { at: number; ms: number }, map: SoundClockMap): void {
  const progress = fadeProgress(fade.at, fade.ms, map.tableMs);
  const remaining = fade.at + fade.ms - map.tableMs;
  const now = map.ctxSeconds;
  if (progress >= 1 || fade.ms <= 0) {
    if (track.target !== to) track.move(to, Math.max(now, map.ctxSecondsOf(fade.at)), 0);
    return;
  }
  if (first) {
    track.join(from, to, Math.max(now, map.ctxSecondsOf(fade.at)), progress > 0 ? remaining / 1000 : fade.ms / 1000, progress);
    return;
  }
  if (track.target === to) return;
  track.fade(to, Math.max(now, map.ctxSecondsOf(fade.at)), Math.min(fade.ms, remaining) / 1000);
}
