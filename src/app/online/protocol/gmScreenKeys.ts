import { isRecord } from './shape.ts';

/**
 * The Keys and Sound screens' messages: the state the Stream Deck's keys show (field for field what Atlas's
 * sound remote reads, `RemoteState`), the moods without their artwork, and the commands a device presses.
 * A command itself is the sound remote's (`RemoteCommand`) and is read by its parser on Atlas's side: one
 * list of commands for every controller.
 */

/** Longest id, name, formula or track name read. */
const MAX_TEXT = 200;
/** Longest piece of a roll's look (`kh1`, `+1d4+2`). */
const MAX_LOOK_TEXT = 64;
/** The most moods and saved rolls a list holds. */
export const MAX_GM_SCREEN_MOODS = 1000;
export const MAX_GM_SCREEN_ROLLS = 256;
/** No level reads louder or quieter than this, in dB. */
const MAX_DB = 200;
/** A crest's id among Atlas's mood crests (`MoodIconId`); the page draws it. */
const CREST_PATTERN = /^[a-z0-9-]{1,48}$/;
const COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** A refusal's reason as Atlas names it (`RemoteRefusal`, `TableRefusal`); the page says each in a sentence of its own. */
const REFUSAL_PATTERN = /^[a-z][a-z-]{0,31}$/;
/** A command's type, before Atlas's parser reads the rest. */
const COMMAND_TYPE_PATTERN = /^[A-Za-z]{1,32}$/;

export interface KeysMusic {
  readonly paused: boolean;
  readonly muted: boolean;
  readonly shuffle: boolean;
  readonly repeat: 'all' | 'one' | 'off';
  readonly levelDb: number;
  readonly track: string | null;
}

export interface KeysCombat {
  readonly active: boolean;
  readonly round: number;
  readonly combatants: number;
  readonly rolls: boolean;
}

export interface KeysPlayer {
  readonly open: boolean;
  readonly presented: boolean;
  readonly frozen: boolean;
  readonly trueScale: boolean;
  readonly hidden: boolean;
  readonly handout: boolean;
}

export interface KeysRoll {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly look: { readonly sides: number | null; readonly count: number; readonly rule: string; readonly rest: string; readonly colour: string | null };
}

/** What the keys show, as the sound remote's state has it. */
export interface KeysState {
  readonly soundOn: boolean;
  readonly mood: string | null;
  readonly playing: boolean;
  readonly stopped: boolean;
  readonly music: KeysMusic | null;
  readonly nowPlaying: string | null;
  readonly levels: { readonly masterDb: number; readonly musicDb: number | null; readonly ambienceDb: number | null };
  readonly ranges: { readonly channel: readonly [number, number]; readonly strip: readonly [number, number] };
  readonly combat: KeysCombat | null;
  readonly player: KeysPlayer;
  readonly rolls: readonly KeysRoll[];
  readonly rollsShown: boolean;
}

/** A mood as a key draws it: its crest by id, never the crest's artwork. */
export interface GmScreenMood {
  readonly id: string;
  readonly name: string;
  readonly tone: { readonly light: string; readonly dark: string };
  readonly crest: string;
}

export type KeysMessage =
  | { readonly t: 'keys'; readonly state: KeysState }
  /** Every mood, in the order the Sound page shows them. */
  | { readonly t: 'moods'; readonly moods: readonly GmScreenMood[] }
  /** Moods that changed, or were added at the end, and those that are gone; a change of order sends `moods`. */
  | { readonly t: 'mood-changes'; readonly moods: readonly GmScreenMood[]; readonly removed: readonly string[] }
  /** Atlas took a press (`id`, the device's), or refused it and says why. */
  | { readonly t: 'press-answer'; readonly id: number; readonly refused: string | null };

/** A device presses a key: `command` is read by the sound remote's parser on Atlas's side, `id` comes back in the answer. */
export interface PressMessage {
  readonly t: 'press';
  readonly id: number;
  readonly command: Readonly<Record<string, unknown>>;
}

const text = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length <= max;
const textOrNull = (value: unknown): value is string | null => value === null || text(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isDb = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_DB;
const isWhole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
/** A press's id: the device counts them. */
export const isPressId = (value: unknown): value is number => isWhole(value, Number.MAX_SAFE_INTEGER);

function parseMusic(value: unknown): KeysMusic | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isBoolean(value.paused) || !isBoolean(value.muted) || !isBoolean(value.shuffle) || !isDb(value.levelDb) || !textOrNull(value.track)) return undefined;
  if (value.repeat !== 'all' && value.repeat !== 'one' && value.repeat !== 'off') return undefined;
  return { paused: value.paused, muted: value.muted, shuffle: value.shuffle, repeat: value.repeat, levelDb: value.levelDb, track: value.track };
}

function parseCombat(value: unknown): KeysCombat | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isBoolean(value.active) || !isWhole(value.round, 1_000_000) || !isWhole(value.combatants, 100_000) || !isBoolean(value.rolls)) return undefined;
  return { active: value.active, round: value.round, combatants: value.combatants, rolls: value.rolls };
}

function parsePlayer(value: unknown): KeysPlayer | null {
  if (!isRecord(value)) return null;
  const { open, presented, frozen, trueScale, hidden, handout } = value;
  if (![open, presented, frozen, trueScale, hidden, handout].every(isBoolean)) return null;
  return { open: open === true, presented: presented === true, frozen: frozen === true, trueScale: trueScale === true, hidden: hidden === true, handout: handout === true };
}

function parseRoll(value: unknown): KeysRoll | null {
  if (!isRecord(value) || !text(value.id) || value.id.length === 0 || !text(value.name) || !text(value.formula) || !isRecord(value.look)) return null;
  const { sides, count, rule, rest, colour } = value.look;
  if (!(sides === null || isWhole(sides, 10_000)) || !isWhole(count, 10_000) || !text(rule, MAX_LOOK_TEXT) || !text(rest, MAX_LOOK_TEXT)) return null;
  if (!(colour === null || (typeof colour === 'string' && COLOUR_PATTERN.test(colour)))) return null;
  return { id: value.id, name: value.name, formula: value.formula, look: { sides, count, rule, rest, colour } };
}

function parseRange(value: unknown): readonly [number, number] | null {
  return Array.isArray(value) && value.length === 2 && isDb(value[0]) && isDb(value[1]) && value[0] <= value[1] ? [value[0], value[1]] : null;
}

/** The keys' state, or null for anything malformed. */
export function parseKeysState(value: unknown): KeysState | null {
  if (!isRecord(value) || !isRecord(value.levels) || !isRecord(value.ranges) || !Array.isArray(value.rolls) || value.rolls.length > MAX_GM_SCREEN_ROLLS) return null;
  const { soundOn, mood, playing, stopped, nowPlaying, rollsShown, levels } = value;
  if (![soundOn, playing, stopped, rollsShown].every(isBoolean) || !textOrNull(mood) || !textOrNull(nowPlaying)) return null;
  if (!isDb(levels.masterDb) || !(levels.musicDb === null || isDb(levels.musicDb)) || !(levels.ambienceDb === null || isDb(levels.ambienceDb))) return null;
  const music = parseMusic(value.music);
  const combat = parseCombat(value.combat);
  const player = parsePlayer(value.player);
  const channel = parseRange(value.ranges.channel);
  const strip = parseRange(value.ranges.strip);
  const rolls = value.rolls.map(parseRoll);
  if (music === undefined || combat === undefined || player === null || channel === null || strip === null) return null;
  if (!rolls.every((roll): roll is KeysRoll => roll !== null)) return null;
  return {
    soundOn: soundOn === true, mood, playing: playing === true, stopped: stopped === true, music, nowPlaying,
    levels: { masterDb: levels.masterDb, musicDb: levels.musicDb, ambienceDb: levels.ambienceDb },
    ranges: { channel, strip }, combat, player, rolls, rollsShown: rollsShown === true,
  };
}

function parseMood(value: unknown): GmScreenMood | null {
  if (!isRecord(value) || !text(value.id) || value.id.length === 0 || !text(value.name) || !isRecord(value.tone)) return null;
  const { light, dark } = value.tone;
  if (typeof light !== 'string' || !COLOUR_PATTERN.test(light) || typeof dark !== 'string' || !COLOUR_PATTERN.test(dark)) return null;
  if (typeof value.crest !== 'string' || !CREST_PATTERN.test(value.crest)) return null;
  return { id: value.id, name: value.name, tone: { light, dark }, crest: value.crest };
}

function parseMoods(value: unknown): GmScreenMood[] | null {
  if (!Array.isArray(value) || value.length > MAX_GM_SCREEN_MOODS) return null;
  const moods = value.map(parseMood);
  return moods.every((mood): mood is GmScreenMood => mood !== null) && new Set(moods.map((mood) => mood.id)).size === moods.length ? moods : null;
}

/** A Keys message from Atlas, or null for anything malformed. */
export function parseKeysMessage(value: Record<string, unknown>): KeysMessage | null {
  switch (value.t) {
    case 'keys': {
      const state = parseKeysState(value.state);
      return state === null ? null : { t: 'keys', state };
    }
    case 'moods': {
      const moods = parseMoods(value.moods);
      return moods === null ? null : { t: 'moods', moods };
    }
    case 'mood-changes': {
      const moods = parseMoods(value.moods);
      const { removed } = value;
      if (moods === null || !Array.isArray(removed) || removed.length > MAX_GM_SCREEN_MOODS || !removed.every((id): id is string => text(id) && id.length > 0)) return null;
      return { t: 'mood-changes', moods, removed };
    }
    case 'press-answer':
      if (!isPressId(value.id) || !(value.refused === null || (typeof value.refused === 'string' && REFUSAL_PATTERN.test(value.refused)))) return null;
      return { t: 'press-answer', id: value.id, refused: value.refused };
    default:
      return null;
  }
}

/** A device's press, or null for anything that names no command. */
export function parsePress(value: Record<string, unknown>): PressMessage | null {
  const { id, command } = value;
  if (!isPressId(id) || !isRecord(command) || typeof command.type !== 'string' || !COMMAND_TYPE_PATTERN.test(command.type)) return null;
  return { t: 'press', id, command };
}
