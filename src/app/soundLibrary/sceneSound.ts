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

/** The key a scene's links stand under; a file without it links no mood, and is not parsed. */
const SOUND_KEY = '"sound"';

/** The links a scene file's text holds (its state's `sound`), or null; a file that is no scene's reads as none. */
export function sceneSoundOfText(text: string): SceneSound | null {
  if (!text.includes(SOUND_KEY)) return null;
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) && isRecord(data.state) ? readSceneSound(data.state.sound) : null;
  } catch {
    return null;
  }
}
