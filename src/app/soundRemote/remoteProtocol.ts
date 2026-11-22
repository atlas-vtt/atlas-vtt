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
  /** Starts a fight when none runs on the GM's map, ends it when one does. */
  | { type: 'combat' }
  /** Rolls every combatant's initiative, as the tracker's Roll button does. */
  | { type: 'rollInitiative' }
  /** Presents the map the GM has in front to the players, opening the player window where it is closed. */
  | { type: 'present' }
  /** Freezes the players' camera, or lets it follow the GM again. */
  | { type: 'freeze' }
  /** Lowers the player window's curtain (players see black), or lifts it. */
  | { type: 'curtain' }
  /** Takes the image or loot the player window shows away from players. */
  | { type: 'takeBackHandout' }
  /** Shows players the vault image under the pointer anywhere in Obsidian, as its menu's "Display on player view" does. */
  | { type: 'showHoveredImage' }
  /** Rolls a saved roll of the map in front's collection, as the dice tray does. */
  | { type: 'roll'; id: string }
  /** Switches "Show my rolls to players". */
  | { type: 'shareRolls' }
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

/** The fight on the map the GM has in front (`combatView`). */
export interface RemoteCombat {
  /** A fight runs. */
  active: boolean;
  round: number;
  /** Combatants in the tracker. */
  combatants: number;
  /** The map's rules roll numbers (turn order); a fight by sides or by cards rolls nothing. */
  rolls: boolean;
}

/** The local player window, as its bar shows it. */
export interface RemotePlayer {
  open: boolean;
  /** The map the GM has in front is the presented scene. */
  presented: boolean;
  /** Players' camera is frozen (false while TrueScale pins it, as the bar shows it). */
  frozen: boolean;
  /** TrueScale pins the players' camera: freezing is not offered then. */
  trueScale: boolean;
  /** The curtain is down: players see black. */
  hidden: boolean;
  /** Players are shown an image or loot. */
  handout: boolean;
}

/**
 * How a saved roll's place in the dice tray's row draws it (`presetFaceParts`): the body of its first die, how
 * many of it, what the roll does to them and what else it adds, and a designed die's colour.
 */
export interface RemoteRollLook {
  /** Faces of the first die; null for Fate dice or a roll without dice. */
  sides: number | null;
  count: number;
  /** What the roll does to those dice, as written: `kh1`, `!`. */
  rule: string;
  /** The rest of the roll: `+3`, `+1d4+2`. */
  rest: string;
  /** `#rrggbb` of a designed die; null draws the dice look of the settings. */
  colour: string | null;
}

/** A saved roll of the map in front's collection. */
export interface RemoteRoll {
  id: string;
  name: string;
  /** As the tray's line shows it: the formula, or a designed roll's dice and bonus. */
  formula: string;
  look: RemoteRollLook;
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
  /** Null while there is no map to act on. */
  combat: RemoteCombat | null;
  player: RemotePlayer;
  /** The saved rolls of the map in front's collection; empty without a map or outside every collection. */
  rolls: RemoteRoll[];
  /** "Show my rolls to players" is on. */
  rollsShown: boolean;
}

export interface RemoteHello {
  app: 'atlas-vtt';
  api: number;
}

const SIMPLE = new Set(['nextMood', 'stopAll', 'pause', 'nextTrack', 'previousTrack', 'shuffle', 'repeat', 'muteMusic', 'combat', 'rollInitiative', 'present', 'freeze', 'curtain', 'takeBackHandout', 'showHoveredImage', 'shareRolls']);
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
  if (type === 'mood' || type === 'roll') return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= MAX_ID ? { type, id: value.id } : null;
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
