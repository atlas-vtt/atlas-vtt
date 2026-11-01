import type { Mood, SceneSound } from '../sound/soundTypes';
import { isRecord } from '../utils/guards';

const isMoodId = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A scene file's `sound`, which arrives unchecked: only ids count, a key of a later version stays, and nothing to tell is null. */
export function readSceneSound(value: unknown): SceneSound | null {
  if (!isRecord(value)) return null;
  const { mood, combatMood, ...later } = value;
  const sound: SceneSound = { ...later, ...(isMoodId(mood) && { mood }), ...(isMoodId(combatMood) && { combatMood }) };
  return Object.keys(sound).length > 0 ? sound : null;
}

/** What a scene links to among `moods`, its collection's: a mood that is gone reads as no link. */
export function linkedMoods(sound: SceneSound | null, moods: readonly Mood[]): { mood: Mood | null; combatMood: Mood | null } {
  const find = (id: string | undefined): Mood | null => (id === undefined ? null : moods.find((mood) => mood.id === id) ?? null);
  return { mood: find(sound?.mood), combatMood: find(sound?.combatMood) };
}

/** The scene file's JSON without its `sound`, for a scene joining a collection that does not hold its moods; null when it has none. */
export function dropSceneSoundFromJson(content: string): string | null {
  const data: unknown = JSON.parse(content);
  if (!isRecord(data) || !isRecord(data.state) || !('sound' in data.state)) return null;
  delete data.state.sound;
  return JSON.stringify(data, null, 2);
}
