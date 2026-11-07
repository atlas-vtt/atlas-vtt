import { WHOLE_DECODE_FRAMES } from '../codec/seekTable';
import type { SoundContext, SoundGainNode, SoundNode } from './audioNodes';
import type { DesiredVoice } from './desiredSound';
import { GainTrack } from './gainTrack';
import { followFade } from './mixerGraph';
import type { SoundClockMap } from './soundClockMap';
import { dbToGain, median, SOUND_RATE } from './soundMath';
import { BufferRun, CROSSFADE_SECONDS, WindowRun, type SoundRun } from './soundRun';
import type { SoundSources } from './soundSources';
import { musicSpanAt, type TimelineSpan } from './soundTimeline';

/** A run for the next track of a list is started this far ahead, in frames. */
const NEXT_RUN_LEAD_FRAMES = 20 * SOUND_RATE;
/** Under this nobody can tell, and correcting would be the only audible thing. */
export const LEAVE_DRIFT_MS = 50;
/** Up to this, the next place a restart cannot be heard is soon enough. Beyond it, at once. */
export const SOFT_DRIFT_MS = 2000;
/** The context's clock moves in steps of its buffer, so one reading says little: this many in a row do. */
const DRIFT_READINGS = 5;
/** Time after a voice has gone for its last samples to fade. */
export const VOICE_END_SECONDS = 0.03;

export type DriftAction = 'leave' | 'restart' | 'seek';

export function driftAction(errorMs: number): DriftAction {
  const size = Math.abs(errorMs);
  if (size < LEAVE_DRIFT_MS) return 'leave';
  return size <= SOFT_DRIFT_MS ? 'restart' : 'seek';
}

/** Read in windows: a long sound, and one whose copy is still being made, which cannot be decoded whole. */
function isLong(span: TimelineSpan): boolean {
  return span.sound.frames > WHOLE_DECODE_FRAMES || span.sound.growing === true;
}

export interface VoiceDeps {
  context: SoundContext;
  sources: SoundSources;
  input: SoundGainNode;
  /** Where it sends what its room should carry. */
  send: SoundGainNode;
  onError: (key: string, error: unknown) => void;
}

/**
 * One music deck or ambience layer: its gain, and the runs of audio behind it. It stays through every
 * change of state that still lists it, and only its gain moves.
 */
export class SoundVoice {
  private readonly node: SoundGainNode;
  private readonly gain: GainTrack;
  /** After its own gain, so fades, mutes and Silence reach the tail too. */
  private readonly sendNode: SoundGainNode;
  private readonly sendGain: GainTrack;
  private sendKey: string | null = null;
  private runs: SoundRun[] = [];
  private anchor: number | null = null;
  /** Nothing new sounds before this context frame while a soft restart is pending. */
  private notBefore = 0;
  private fadeKey: string | null = null;
  private drift: number[] = [];
  private lastCtxSeconds = -1;

  constructor(private readonly deps: VoiceDeps) {
    this.node = deps.context.createGain();
    this.gain = new GainTrack(this.node.gain, 0);
    this.node.connect(deps.input);
    this.sendNode = deps.context.createGain();
    this.sendGain = new GainTrack(this.sendNode.gain, 0);
    this.node.connect(this.sendNode);
    this.sendNode.connect(deps.send);
  }

  /** Whether it plays with its start on this context frame, as far as anyone could hear. */
  startsAt(ctxFrame: number, rate: number): boolean {
    return this.anchor !== null && (Math.abs(ctxFrame - this.anchor) / rate) * 1000 < LEAVE_DRIFT_MS;
  }

  /** The voice past its level and fades. */
  get output(): SoundNode {
    return this.node;
  }

  /** The sounds this voice is still waiting for the bytes of. */
  get waitingKeys(): string[] {
    return this.runs.filter((run) => run.waiting).map((run) => run.span.sound.key);
  }

  follow(desired: DesiredVoice, map: SoundClockMap): void {
    this.followGain(desired, map);
    this.followSend(desired, map);
    const expected = map.ctxFrameOf(desired.startAt);
    this.anchor ??= expected;
    this.correctDrift(expected, map);
    this.dropFinished(map);
    this.ensureRuns(desired, map);
    for (const run of this.runs) run.pump();
  }

  /** Fades out and stops. The player keeps the voice until `dispose`, once that is over. */
  end(map: SoundClockMap): void {
    this.gain.move(0, map.ctxSeconds, VOICE_END_SECONDS);
  }

  dispose(): void {
    for (const run of this.runs) run.dispose();
    this.runs = [];
    this.node.disconnect();
    this.sendNode.disconnect();
  }

  /** Coming in or leaving, the voice's own gain carries the fade, so the send is set at once; else it moves as the level does. */
  private followSend(desired: DesiredVoice, map: SoundClockMap): void {
    const key = `${desired.role}|${desired.fade.at}|${desired.fade.ms}|${desired.send}`;
    if (key === this.sendKey) return;
    const first = this.sendKey === null;
    this.sendKey = key;
    if (this.sendGain.target === desired.send) return;
    if (first || desired.role !== 'level') this.sendGain.move(desired.send, map.ctxSeconds, 0);
    else this.sendGain.move(desired.send, Math.max(map.ctxSeconds, map.ctxSecondsOf(desired.fade.at)), desired.fade.ms / 1000);
  }

  private followGain(desired: DesiredVoice, map: SoundClockMap): void {
    const target = desired.level;
    const key = `${desired.role}|${desired.fade.at}|${desired.fade.ms}|${target}`;
    if (key === this.fadeKey) return;
    const first = this.fadeKey === null;
    this.fadeKey = key;
    if (desired.role === 'in') {
      followFade(this.gain, first, target, 0, desired.fade, map);
    } else if (desired.role === 'out') {
      followFade(this.gain, first, 0, target, desired.fade, map);
    } else if (first) {
      this.gain.move(target, map.ctxSeconds, 0);
    } else if (this.gain.target !== target) {
      this.gain.move(target, Math.max(map.ctxSeconds, map.ctxSecondsOf(desired.fade.at)), desired.fade.ms / 1000);
    }
  }

  private correctDrift(expected: number, map: SoundClockMap): void {
    const anchor = this.anchor;
    // A standing clock says nothing of drift: it says the context is frozen, which the watchdog handles.
    if (anchor === null || map.ctxSeconds === this.lastCtxSeconds) return;
    this.lastCtxSeconds = map.ctxSeconds;
    if (map.nowFrame < this.notBefore) return;
    this.drift.push(((expected - anchor) / map.rate) * 1000);
    if (this.drift.length < DRIFT_READINGS) return;
    const action = driftAction(median(this.drift));
    this.drift = [];
    if (action === 'leave') return;
    this.anchor = expected;
    const nowFrame = map.nowFrame;
    const sounding = this.runs.filter((run) => !run.finishing && !this.isAhead(run, anchor, nowFrame));
    for (const run of this.runs.filter((other) => this.isAhead(other, anchor, nowFrame))) run.dispose();
    this.runs = this.runs.filter((run) => !this.isAhead(run, anchor, nowFrame));
    const crossfadeFrames = Math.round(CROSSFADE_SECONDS * map.rate);
    // A run that ended a moment ago is still here, and its end is no place to stop what plays now.
    const boundaries = sounding.flatMap((run) => run.boundaryFrame(nowFrame) ?? []).filter((frame) => frame >= nowFrame + crossfadeFrames);
    const at = boundaries.length === 0 ? null : Math.min(...boundaries);
    if (action === 'seek' || at === null) {
      const end = nowFrame + crossfadeFrames;
      for (const run of sounding) run.finishAt(end, CROSSFADE_SECONDS);
      this.notBefore = nowFrame;
      return;
    }
    for (const run of sounding) run.finishAt(at, CROSSFADE_SECONDS);
    this.notBefore = at - crossfadeFrames;
  }

  private isAhead(run: SoundRun, anchor: number, nowFrame: number): boolean {
    return anchor + run.span.startPlayFrame * (this.deps.context.sampleRate / SOUND_RATE) > nowFrame;
  }

  private dropFinished(map: SoundClockMap): void {
    const anchor = this.anchor;
    if (anchor === null) return;
    const ratio = map.rate / SOUND_RATE;
    this.runs = this.runs.filter((run) => {
      const end = run.span.endPlayFrame;
      const over = run.finishing ? map.nowFrame > this.notBefore + Math.round(CROSSFADE_SECONDS * 2 * map.rate) : end !== null && anchor + end * ratio + map.rate < map.nowFrame;
      if (over) run.dispose();
      return !over;
    });
  }

  private ensureRuns(desired: DesiredVoice, map: SoundClockMap): void {
    if (desired.fadeGain === 0 && desired.role === 'out') return;
    let span: TimelineSpan | null = desired.span;
    const horizon = Math.max(desired.playFrame, 0) + NEXT_RUN_LEAD_FRAMES;
    while (span && span.startPlayFrame <= horizon) {
      this.ensureRun(span, map);
      span = span.endPlayFrame !== null && desired.list ? musicSpanAt(desired.list, span.endPlayFrame) : null;
    }
  }

  private ensureRun(span: TimelineSpan, map: SoundClockMap): void {
    const anchor = this.anchor;
    if (anchor === null) return;
    const gain = dbToGain(span.sound.gainDb);
    const same = this.runs.find((run) => !run.finishing && run.span.startPlayFrame === span.startPlayFrame && run.span.sound.key === span.sound.key);
    if (same) {
      if (same.span !== span) same.follow(span, gain);
      return;
    }
    const deps = { context: this.deps.context, sources: this.deps.sources, output: this.node, onError: this.deps.onError };
    const notBefore = Math.max(this.notBefore, map.nowFrame);
    this.runs.push(isLong(span) ? new WindowRun(deps, span, anchor, notBefore, gain) : new BufferRun(deps, span, anchor, notBefore, gain));
  }
}
