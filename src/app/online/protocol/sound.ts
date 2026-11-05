import { isAssetId, isCount, parseAudioAsset, type AssetRef } from './asset.ts';
import { isRecord } from './shape.ts';

/** Ambience layers one state may hold: as many as a mood. */
export const MAX_SOUND_LAYERS = 8;
/** Tracks of one music list. */
export const MAX_SOUND_TRACKS = 512;
/** Lists or layers fading out at once. */
export const MAX_SOUND_OUTGOING = 8;
/** Sounds one hint names. */
export const MAX_PREPARED_SOUNDS = 32;
/** Sounds a page names as still waiting. */
export const MAX_SOUND_WAITING = 16;

/** Frames of the longest sound there can be: past six hours by far, within what a number holds exactly. */
const MAX_FRAMES = 2 ** 40;
const MIN_GAIN_DB = -120;
const MAX_GAIN_DB = 40;
const MAX_FADE_MS = 10 * 60_000;
/** A time on the table's clock, or a seed: a whole number a double holds exactly is more than either needs. */
const MAX_TIME = 2 ** 52;

/** How a list goes on past its end. Unset goes round. */
export type SharedMusicRepeat = 'one' | 'off';

/** The spaces a table's reverb can ring in. */
export const SHARED_ROOMS = ['room', 'hall', 'cave', 'cathedral'] as const;
export type SharedRoomId = (typeof SHARED_ROOMS)[number];

/**
 * A sound as a page plays it. `key` is the id it is stored under and nothing else: it says neither the
 * sound's name nor the source's hash. `asset` is how it is fetched; without one the GM's Atlas could not
 * store it, and its place in a list stays silent. No credit reaches a page: what the GM plays, and whose it
 * is, is the GM's to know (owner, 2026-11-04); a `credit` an older Atlas sends is dropped on reading.
 */
export interface SharedSoundInfo {
  readonly key: string;
  readonly frames: number;
  readonly gainDb: number;
  readonly loop?: { readonly startFrame: number; readonly endFrame: number };
  readonly asset?: AssetRef;
  /** Its copy is still being made: `frames` and `gainDb` are what can be told so far, and the GM sends the real ones. */
  readonly growing?: true;
}

export interface SharedSoundFade {
  readonly at: number;
  readonly ms: number;
}

export interface SharedMusicPlay {
  readonly tracks: SharedSoundInfo[];
  readonly seed: number;
  readonly shuffle: boolean;
  readonly startAt: number;
  readonly gainDb: number;
  readonly muted?: boolean;
  /** How much of it the room carries, 0 to 1. Unset is dry. */
  readonly reverb?: number;
  readonly fade: SharedSoundFade;
  readonly repeat?: SharedMusicRepeat;
  /** Frames of the list behind `startAt`. Unset is 0. */
  readonly listFrame?: number;
}

export interface SharedLayerPlay {
  readonly sound: SharedSoundInfo;
  readonly startAt: number;
  readonly gainDb: number;
  readonly muted?: boolean;
  readonly reverb?: number;
  readonly fade: SharedSoundFade;
}

/** The room the reverb rings in, and the crossfade that brought it. */
export interface SharedSoundRoom {
  readonly id: SharedRoomId;
  readonly fade: SharedSoundFade;
}

/** The whole small state of a table's sound on the table's clock: every page works out what should sound from this alone. */
export interface SharedTableSound {
  readonly revision: number;
  readonly silenced: boolean;
  readonly silenceFade: SharedSoundFade;
  readonly music: SharedMusicPlay | null;
  readonly outgoing: SharedMusicPlay[];
  readonly layers: SharedLayerPlay[];
  readonly outgoingLayers: SharedLayerPlay[];
  /** Unset: the first of `SHARED_ROOMS`. */
  readonly room?: SharedSoundRoom;
}

/** The table's sound, whole, sent on each change and to whoever comes. */
export interface SoundMessage {
  readonly t: 'sound';
  readonly state: SharedTableSound;
}

/** What may be asked for next (the next mood, those the shown scene links): fetched ahead, played by nothing yet. */
export interface SoundPrepare {
  readonly t: 'sound-prepare';
  readonly assets: readonly AssetRef[];
}

export const SOUND_LIFECYCLES = ['off', 'joining', 'playing', 'needs-tap'] as const;
export type SharedSoundLifecycle = (typeof SOUND_LIFECYCLES)[number];

/** How sound stands on a player's page, sent only when it changes: its lifecycle and the sounds it waits for, by key. */
export interface PlayerSoundState {
  readonly t: 'sound-state';
  readonly state: SharedSoundLifecycle;
  readonly waiting: readonly string[];
}

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_TIME;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const gainOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? clamp(value, MIN_GAIN_DB, MAX_GAIN_DB) : null);

function parseFade(value: unknown): SharedSoundFade | null {
  if (!isRecord(value) || !isTime(value.at) || typeof value.ms !== 'number' || !Number.isFinite(value.ms)) return null;
  return { at: value.at, ms: clamp(value.ms, 0, MAX_FADE_MS) };
}

/** A loop inside the sound, or none: anything else plays the whole sound. */
function parseLoop(value: unknown, frames: number): SharedSoundInfo['loop'] {
  if (!isRecord(value) || !isCount(value.startFrame, frames) || !isCount(value.endFrame, frames) || value.startFrame >= value.endFrame) return undefined;
  return { startFrame: value.startFrame, endFrame: value.endFrame };
}

function parseInfo(value: unknown): SharedSoundInfo | null {
  if (!isRecord(value) || !isAssetId(value.key) || !isCount(value.frames, MAX_FRAMES) || value.frames < 1) return null;
  const gainDb = gainOf(value.gainDb);
  if (gainDb === null) return null;
  const asset = value.asset === undefined ? undefined : parseAudioAsset(value.asset);
  if (asset === null || (asset !== undefined && asset.id !== value.key)) return null;
  const loop = parseLoop(value.loop, value.frames);
  return { key: value.key, frames: value.frames, gainDb, ...(loop && { loop }), ...(asset && { asset }), ...(value.growing === true && { growing: true as const }) };
}

/** What a list and a layer have in common. */
function parsePlayBase(value: Record<string, unknown>): Pick<SharedMusicPlay, 'startAt' | 'gainDb' | 'fade' | 'reverb'> & { readonly muted?: true } | null {
  const gainDb = gainOf(value.gainDb);
  const fade = parseFade(value.fade);
  if (!isTime(value.startAt) || gainDb === null || fade === null) return null;
  // Reverb only colours what plays: anything that is no amount reads as dry, not as a state to refuse.
  const reverb = typeof value.reverb === 'number' && Number.isFinite(value.reverb) && value.reverb > 0 ? Math.min(1, value.reverb) : undefined;
  return { startAt: value.startAt, gainDb, fade, ...(value.muted === true && { muted: true as const }), ...(reverb !== undefined && { reverb }) };
}

/** A room this page knows, or none: a newer GM's room plays in the first. */
function parseRoom(value: unknown): SharedSoundRoom | undefined {
  if (!isRecord(value)) return undefined;
  const id = SHARED_ROOMS.find((room) => room === value.id);
  const fade = parseFade(value.fade);
  return id && fade ? { id, fade } : undefined;
}

function parseMusic(value: unknown): SharedMusicPlay | null {
  if (!isRecord(value) || !Array.isArray(value.tracks) || value.tracks.length === 0 || value.tracks.length > MAX_SOUND_TRACKS || !isTime(value.seed)) return null;
  const base = parsePlayBase(value);
  const tracks = value.tracks.map(parseInfo);
  if (base === null || !tracks.every((track) => track !== null)) return null;
  // How a list ends is told, never checked: anything else in these fields reads as unset, not as a state to refuse.
  const repeat = value.repeat === 'one' || value.repeat === 'off' ? value.repeat : undefined;
  const listFrame = isCount(value.listFrame, MAX_TIME) && value.listFrame > 0 ? value.listFrame : undefined;
  return { ...base, tracks, seed: value.seed, shuffle: value.shuffle === true, ...(repeat && { repeat }), ...(listFrame !== undefined && { listFrame }) };
}

function parseLayer(value: unknown): SharedLayerPlay | null {
  if (!isRecord(value)) return null;
  const base = parsePlayBase(value);
  const sound = parseInfo(value.sound);
  return base === null || sound === null ? null : { ...base, sound };
}

function parseList<T>(value: unknown, limit: number, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const list = value.map(parse);
  return list.every((entry) => entry !== null) ? list : null;
}

/** A table's sound as a page takes it, or null for anything malformed: the page keeps what it had. */
export function parseSoundState(value: unknown): SharedTableSound | null {
  if (!isRecord(value) || !isTime(value.revision)) return null;
  const silenceFade = parseFade(value.silenceFade);
  const music = value.music === null ? null : parseMusic(value.music);
  const outgoing = parseList(value.outgoing, MAX_SOUND_OUTGOING, parseMusic);
  const layers = parseList(value.layers, MAX_SOUND_LAYERS, parseLayer);
  const outgoingLayers = parseList(value.outgoingLayers, MAX_SOUND_OUTGOING, parseLayer);
  if (silenceFade === null || (music === null && value.music !== null) || outgoing === null || layers === null || outgoingLayers === null) return null;
  const room = parseRoom(value.room);
  return { revision: value.revision, silenced: value.silenced === true, silenceFade, music, outgoing, layers, outgoingLayers, ...(room && { room }) };
}

export function parseSoundMessage(value: Record<string, unknown>): SoundMessage | null {
  const state = parseSoundState(value.state);
  return state === null ? null : { t: 'sound', state };
}

export function parseSoundPrepare(value: Record<string, unknown>): SoundPrepare | null {
  const assets = parseList(value.assets, MAX_PREPARED_SOUNDS, parseAudioAsset);
  return assets === null ? null : { t: 'sound-prepare', assets };
}

export function parsePlayerSoundState(value: Record<string, unknown>): PlayerSoundState | null {
  const { state, waiting } = value;
  if (!SOUND_LIFECYCLES.includes(state as SharedSoundLifecycle) || !Array.isArray(waiting) || waiting.length > MAX_SOUND_WAITING || !waiting.every(isAssetId)) return null;
  return { t: 'sound-state', state: state as SharedSoundLifecycle, waiting };
}
