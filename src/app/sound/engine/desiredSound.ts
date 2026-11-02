import type { LayerPlay, MusicPlay, SoundFade, TableSound } from '../soundTypes';
import { dbToGain, fadeInGain, fadeOutGain, fadeProgress } from './soundMath';
import { frameInSpan, layerSpan, musicSpanAt, playFrameAt, type TimelineSpan } from './soundTimeline';

export type VoiceChannel = 'music' | 'ambience';

/**
 * How a voice's fade reads. `in`: it comes in from silence (its fade begins where it begins). `out`:
 * it is leaving. `level`: it already sounds and moves to its level; a client that joins late lands on
 * that level, as nothing says what it moved from.
 */
export type VoiceRole = 'in' | 'out' | 'level';

/** One music deck or ambience layer as it should sound at one moment. */
export interface DesiredVoice {
  /** The same play has the same id in every state, so it keeps playing through a change. */
  id: string;
  channel: VoiceChannel;
  /** The sound filling this moment of the play. */
  span: TimelineSpan;
  /** The list a music voice goes on through; null for a layer. */
  list: MusicPlay | null;
  startAt: number;
  /** Frames since `startAt`; negative before it begins. */
  playFrame: number;
  /** The sound's own frame that should be sounding, 0 before it begins. */
  frame: number;
  startsInMs: number;
  role: VoiceRole;
  fade: SoundFade;
  /** The level the play asks for, linear, 0 while muted. */
  level: number;
  /** The sound's own measured gain, linear. */
  soundGain: number;
  /** How far the fade lets it through at this moment, 0 to 1. */
  fadeGain: number;
  /** What should reach the channel: level, sound gain, fade and silence together. */
  gain: number;
}

export interface DesiredSilence {
  silenced: boolean;
  fade: SoundFade;
  /** 0 to 1: what the Silence fade lets through at this moment. */
  gain: number;
}

export interface DesiredSound {
  silence: DesiredSilence;
  voices: DesiredVoice[];
}

function silenceGain(state: TableSound, tableMs: number): number {
  const progress = fadeProgress(state.silenceFade.at, state.silenceFade.ms, tableMs);
  return state.silenced ? fadeOutGain(progress) : fadeInGain(progress);
}

/** A play coming in starts where its fade starts; any other fade changes the level of what sounds. */
function roleOf(play: { startAt: number; fade: SoundFade }, leaving: boolean): VoiceRole {
  if (leaving) return 'out';
  return Math.abs(play.fade.at - play.startAt) < 1 ? 'in' : 'level';
}

function fadeGainOf(role: VoiceRole, fade: SoundFade, tableMs: number): number {
  const progress = fadeProgress(fade.at, fade.ms, tableMs);
  if (role === 'in') return fadeInGain(progress);
  if (role === 'out') return fadeOutGain(progress);
  return 1;
}

function isOver(fade: SoundFade, tableMs: number): boolean {
  return tableMs >= fade.at + fade.ms;
}

function voiceOf(
  id: string,
  channel: VoiceChannel,
  play: MusicPlay | LayerPlay,
  list: MusicPlay | null,
  span: TimelineSpan,
  role: VoiceRole,
  muted: boolean,
  silence: number,
  tableMs: number,
): DesiredVoice {
  const playFrame = playFrameAt(play.startAt, tableMs);
  const level = muted ? 0 : dbToGain(play.gainDb);
  const soundGain = dbToGain(span.sound.gainDb);
  const fadeGain = fadeGainOf(role, play.fade, tableMs);
  return {
    id,
    channel,
    span,
    list,
    startAt: play.startAt,
    playFrame,
    frame: frameInSpan(span, playFrame),
    startsInMs: Math.max(0, play.startAt - tableMs),
    role,
    fade: play.fade,
    level,
    soundGain,
    fadeGain,
    gain: level * soundGain * fadeGain * silence,
  };
}

export function musicVoiceId(play: MusicPlay): string {
  return `music:${play.startAt}:${play.seed}:${play.shuffle ? 's' : 'o'}:${play.tracks.map((track) => track.key).join(',')}`;
}

export function layerVoiceId(play: LayerPlay): string {
  return `layer:${play.startAt}:${play.sound.key}`;
}

/** The sound key of a layer's voice; null for a music deck. */
export function layerKeyOfVoice(id: string): string | null {
  return id.startsWith('layer:') ? id.slice(id.indexOf(':', 'layer:'.length) + 1) : null;
}

function musicVoice(play: MusicPlay, leaving: boolean, silence: number, tableMs: number): DesiredVoice | null {
  const span = musicSpanAt(play, playFrameAt(play.startAt, tableMs));
  return span && voiceOf(musicVoiceId(play), 'music', play, play, span, roleOf(play, leaving), play.muted === true, silence, tableMs);
}

function layerVoice(play: LayerPlay, leaving: boolean, silence: number, tableMs: number): DesiredVoice | null {
  const span = layerSpan(play);
  return span && voiceOf(layerVoiceId(play), 'ambience', play, null, span, roleOf(play, leaving), play.muted === true, silence, tableMs);
}

/**
 * What should be sounding at a table time: the one function behind playing, joining late, coming back
 * after a reconnect and returning to a hidden tab. Pure: it reads only the state and the time.
 */
export function desiredSound(state: TableSound, tableMs: number): DesiredSound {
  const silence = silenceGain(state, tableMs);
  const voices: DesiredVoice[] = [];
  const add = (voice: DesiredVoice | null): void => {
    if (voice && !voices.some((other) => other.id === voice.id)) voices.push(voice);
  };
  if (state.music) add(musicVoice(state.music, false, silence, tableMs));
  for (const play of state.layers) add(layerVoice(play, false, silence, tableMs));
  for (const play of state.outgoing) if (!isOver(play.fade, tableMs)) add(musicVoice(play, true, silence, tableMs));
  for (const play of state.outgoingLayers) if (!isOver(play.fade, tableMs)) add(layerVoice(play, true, silence, tableMs));
  return { silence: { silenced: state.silenced, fade: state.silenceFade, gain: silence }, voices };
}
