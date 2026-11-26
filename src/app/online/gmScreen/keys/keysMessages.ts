import type { Mood } from '../../../sound/soundTypes';
import { moodIcon, moodTone } from '../../../soundLibrary/moodLook';
import type { RemoteRoll, RemoteState } from '../../../soundRemote/remoteProtocol';
import { MAX_GM_SCREEN_MOODS, MAX_GM_SCREEN_ROLLS, type GmScreenMood, type KeysMessage, type KeysState } from '../../protocol/index.ts';

/** The longest text a device reads in a Keys message (`parseKeysMessage`): a longer one would void the whole message. */
const MAX_TEXT = 200;
/** The longest piece of a roll's look the device reads. */
const MAX_LOOK_TEXT = 64;
/** No level reads louder or quieter on a device. */
const MAX_DB = 200;

const cut = (text: string, max = MAX_TEXT): string => (text.length > max ? text.slice(0, max) : text);
const cutOrNull = (text: string | null): string | null => (text === null ? null : cut(text));
const db = (value: number): number => Math.min(MAX_DB, Math.max(-MAX_DB, value));
const dbOrNull = (value: number | null): number | null => (value === null ? null : db(value));
/** An id a device can press: one cut short would name nothing. */
const pressable = (id: string): boolean => id.length > 0 && id.length <= MAX_TEXT;

function keysRoll(roll: RemoteRoll): KeysState['rolls'][number] {
  const { look } = roll;
  return { id: roll.id, name: cut(roll.name), formula: cut(roll.formula), look: { ...look, rule: cut(look.rule, MAX_LOOK_TEXT), rest: cut(look.rest, MAX_LOOK_TEXT) } };
}

/** The sound remote's state as a device reads it: the same fields, each text and list within what the device's parser takes. */
export function keysStateOf(state: RemoteState): KeysState {
  const { music, levels } = state;
  return {
    ...state,
    mood: state.mood !== null && pressable(state.mood) ? state.mood : null,
    music: music === null ? null : { ...music, levelDb: db(music.levelDb), track: cutOrNull(music.track) },
    nowPlaying: cutOrNull(state.nowPlaying),
    levels: { masterDb: db(levels.masterDb), musicDb: dbOrNull(levels.musicDb), ambienceDb: dbOrNull(levels.ambienceDb) },
    rolls: state.rolls.filter((roll) => pressable(roll.id)).slice(0, MAX_GM_SCREEN_ROLLS).map(keysRoll),
  };
}

/** The moods as keys draw them, in the Sound page's order: each crest by its id, which the page draws itself. */
export function gmScreenMoods(moods: readonly Mood[]): GmScreenMood[] {
  return moods
    .filter((mood) => pressable(mood.id))
    .slice(0, MAX_GM_SCREEN_MOODS)
    .map((mood) => {
      const { light, dark } = moodTone(mood);
      return { id: mood.id, name: cut(mood.name), tone: { light, dark }, crest: moodIcon(mood) };
    });
}

const sameMood = (a: GmScreenMood, b: GmScreenMood): boolean =>
  a.name === b.name && a.crest === b.crest && a.tone.light === b.tone.light && a.tone.dark === b.tone.dark;

/**
 * What takes a device from the moods it holds to `after`: the moods that changed or were added at the end and
 * those that are gone, or the whole list where the order changed; null where nothing a key draws changed.
 */
export function moodsMessage(before: readonly GmScreenMood[], after: readonly GmScreenMood[]): KeysMessage | null {
  const kept = new Map(after.map((mood) => [mood.id, mood]));
  const held = new Map(before.map((mood) => [mood.id, mood]));
  const removed = before.filter((mood) => !kept.has(mood.id)).map((mood) => mood.id);
  const staying = before.filter((mood) => kept.has(mood.id));
  // A device keeps the moods it has in their place and puts new ones at the end: any other order is sent whole.
  if (staying.some((mood, index) => after[index]?.id !== mood.id)) return { t: 'moods', moods: after };
  const changed = after.filter((mood) => {
    const old = held.get(mood.id);
    return old === undefined || !sameMood(old, mood);
  });
  return changed.length === 0 && removed.length === 0 ? null : { t: 'mood-changes', moods: changed, removed };
}
