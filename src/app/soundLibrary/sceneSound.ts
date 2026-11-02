import type { SceneSound } from '../sound/soundTypes';
import { isRecord } from '../utils/guards';

const isMoodId = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A scene file's `sound`, which arrives unchecked: only ids count, a key of a later version stays, and nothing to tell is null. */
export function readSceneSound(value: unknown): SceneSound | null {
  if (!isRecord(value)) return null;
  const { mood, combatMood, ...later } = value;
  const sound: SceneSound = { ...later, ...(isMoodId(mood) && { mood }), ...(isMoodId(combatMood) && { combatMood }) };
  return Object.keys(sound).length > 0 ? sound : null;
}

/** The scene file's JSON without its `sound`, for a scene joining a collection that does not hold its moods; null when it has none. */
export function dropSceneSoundFromJson(content: string): string | null {
  const data: unknown = JSON.parse(content);
  if (!isRecord(data) || !isRecord(data.state) || !('sound' in data.state)) return null;
  delete data.state.sound;
  return JSON.stringify(data, null, 2);
}
