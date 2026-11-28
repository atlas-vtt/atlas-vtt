import { isFiniteNumber, isRecord } from '../utils/guards';

export const REMOTE_CHANNELS = ['master', 'music', 'ambience', 'musicStrip'] as const;
/**
 * `master` is this device's level; `music` is the Sound page's Music fader and `ambience` moves every layer's fader alike
 * (both heard by players too). `musicStrip` is what controllers before 2026-11-23 sent for the Music fader: it is `music`.
 */
export type RemoteChannel = (typeof REMOTE_CHANNELS)[number];

export type RemoteRepeat = 'all' | 'one' | 'off';

/**
 * What a controller sends, whatever carries it (`http/` for one on this computer); `RemoteState` is what it hears.
 * `RemoteControl` runs them.
 */
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
  /** Opens the player window where it is closed, on the presented scene or else the map in front, and closes it where it is open. */
  | { type: 'playerWindow' }
  /** Pauses play (the player window's camera freezes, online players' moves wait), or lets it go on. */
  | { type: 'freeze' }
  /** Lowers the curtain (players see black, in the player window and online), or lifts it. */
  | { type: 'curtain' }
  /** Takes the image or loot the player window shows away from players. */
  | { type: 'takeBackHandout' }
  /** Shows players the vault image under the pointer anywhere in Obsidian, as its menu's "Display on player view" does. */
  | { type: 'showHoveredImage' }
  /** Rolls a saved roll of the map in front's collection, as the dice tray does. */
  | { type: 'roll'; id: string }
  /** Rolls a formula with dice (`1d20`, `2d6+3`) on the map in front, as the dice tray's line does. */
  | { type: 'dice'; formula: string }
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

/** The local player window and the online table, as the player window's bar shows them. */
export interface RemotePlayer {
  open: boolean;
  /** The map the GM has in front is the presented scene. */
  presented: boolean;
  /** Play is paused for the player window or online players (false while TrueScale pins the window and no table runs, as the bar shows it). */
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
  /** What the level keys show: Master, the Music fader, the loudest ambience layer; null where the mix has none. */
  levels: { masterDb: number; musicDb: number | null; ambienceDb: number | null };
  ranges: { channel: [number, number]; strip: [number, number] };
  /** Null while there is no map to act on. */
  combat: RemoteCombat | null;
  player: RemotePlayer;
  /** The saved rolls of the map in front's collection; empty without a map or outside every collection. */
  rolls: RemoteRoll[];
  /** "Show my rolls to players" is on. */
  rollsShown: boolean;
}

const SIMPLE = new Set(['nextMood', 'stopAll', 'pause', 'nextTrack', 'previousTrack', 'shuffle', 'repeat', 'muteMusic', 'combat', 'rollInitiative', 'present', 'playerWindow', 'freeze', 'curtain', 'takeBackHandout', 'showHoveredImage', 'shareRolls']);
const MAX_ID = 200;
/** Longer than the dice tool rolls, so a formula over its limits is refused by the dice tool and says why. */
const MAX_FORMULA = 200;
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
  if (type === 'dice') return typeof value.formula === 'string' && value.formula.length > 0 && value.formula.length <= MAX_FORMULA ? { type, formula: value.formula } : null;
  if (type === 'level') return parseLevel(value);
  return SIMPLE.has(type) ? ({ type } as RemoteCommand) : null;
}
