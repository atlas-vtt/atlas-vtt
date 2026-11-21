import { isFiniteNumber, isRecord } from '../utils/guards';

/**
 * The sound remote's wire: what a controller on this computer (the Atlas Stream Deck plugin) sends and
 * hears. JSON over HTTP on 127.0.0.1, the state pushed as server-sent events. Version 1; a controller reads
 * `api` from `/v1/hello` and a change that breaks it takes a new path prefix.
 */
export const REMOTE_API_VERSION = 1;

/** Fixed, so a controller finds Atlas without being told. */
export const REMOTE_PORT = 47823;

/** Every request carries it: a browser cannot send a header of its own to another origin without a preflight, which is refused. */
export const REMOTE_HEADER = 'x-atlas-remote';

/** Longest body a command or a pairing request may have. */
export const MAX_REMOTE_BODY = 4096;

/** Longest name a controller may give itself in the pairing prompt. */
export const MAX_CLIENT_NAME = 64;

export const REMOTE_CHANNELS = ['master', 'music', 'ambience', 'musicStrip'] as const;
/** `master`, `music` and `ambience` are this device's levels (Settings); `musicStrip` is the music's fader in the mix, which players hear too. */
export type RemoteChannel = (typeof REMOTE_CHANNELS)[number];

export type RemoteRepeat = 'all' | 'one' | 'off';

export type RemoteCommand =
  | { type: 'mood'; id: string }
  | { type: 'nextMood' }
  | { type: 'stopAll' }
  | { type: 'pause' }
  | { type: 'nextTrack' }
  | { type: 'previousTrack' }
  | { type: 'shuffle' }
  | { type: 'repeat' }
  | { type: 'muteMusic' }
  /** `db` sets the level, `deltaDb` moves it; `reset` puts it back to 0 dB. Exactly one of them. */
  | { type: 'level'; channel: RemoteChannel; db?: number; deltaDb?: number; reset?: true };

/** A mood as a key draws it: its crest is an SVG path on a 512 × 512 canvas. */
export interface RemoteMood {
  id: string;
  name: string;
  tone: { light: string; dark: string };
  crest: string;
}

export interface RemoteMusic {
  paused: boolean;
  muted: boolean;
  shuffle: boolean;
  repeat: RemoteRepeat;
  levelDb: number;
  /** The track sounding, by its name; null while none does (a list not begun, a pause). */
  track: string | null;
}

export interface RemoteState {
  /** Sound is switched on in Atlas' experimental features. Every command is refused while it is not. */
  soundOn: boolean;
  /** The mood the mix was last set to, while it still is that mood. */
  mood: string | null;
  /** Anything sounds now. */
  playing: boolean;
  /** Stop all holds a mix that Bring back would bring back. */
  stopped: boolean;
  music: RemoteMusic | null;
  /** What the status bar names: the mood, else the track, else the first layer. */
  nowPlaying: string | null;
  levels: { masterDb: number; musicDb: number; ambienceDb: number };
  ranges: { channel: [number, number]; strip: [number, number] };
}

export interface RemoteHello {
  app: 'atlas-vtt';
  api: number;
}

const SIMPLE = new Set(['nextMood', 'stopAll', 'pause', 'nextTrack', 'previousTrack', 'shuffle', 'repeat', 'muteMusic']);
const MAX_ID = 200;
/** No dial turns further in one event. */
const MAX_STEP_DB = 60;

const isChannel = (value: unknown): value is RemoteChannel => typeof value === 'string' && (REMOTE_CHANNELS as readonly string[]).includes(value);

function parseLevel(body: Record<string, unknown>): RemoteCommand | null {
  const { channel, db, deltaDb, reset } = body;
  if (!isChannel(channel)) return null;
  const given = [db !== undefined, deltaDb !== undefined, reset !== undefined].filter(Boolean).length;
  if (given !== 1) return null;
  if (reset !== undefined) return reset === true ? { type: 'level', channel, reset: true } : null;
  if (db !== undefined) return isFiniteNumber(db) && Math.abs(db) <= MAX_STEP_DB * 2 ? { type: 'level', channel, db } : null;
  return isFiniteNumber(deltaDb) && Math.abs(deltaDb) <= MAX_STEP_DB ? { type: 'level', channel, deltaDb } : null;
}

/** A command from the wire, or null where it is not one this version knows exactly. */
export function parseRemoteCommand(value: unknown): RemoteCommand | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  const { type } = value;
  if (type === 'mood') return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= MAX_ID ? { type, id: value.id } : null;
  if (type === 'level') return parseLevel(value);
  return SIMPLE.has(type) ? ({ type } as RemoteCommand) : null;
}

/** The name a controller gave itself, cut to what the prompt shows; anything else reads as no name. */
export function parseClientName(value: unknown): string | null {
  if (!isRecord(value) || typeof value.client !== 'string') return null;
  // Control characters could rearrange the prompt's text.
  const name = value.client.replace(/\p{Cc}/gu, '').trim().slice(0, MAX_CLIENT_NAME);
  return name.length > 0 ? name : null;
}
