import type { NotePin } from '../types';
import { hasLevels, resolveLevel, type SceneLevels } from './sceneLevels';

/**
 * The level of its linked scene a pin opens, given that scene's `levels`: the one it names, the
 * first where the scene no longer has it, and null where it names none or the scene has one level
 * (the scene then opens as it opens). The one place that reads `NotePin.sceneLevel`.
 */
export function pinSceneLevel(pin: Pick<NotePin, 'sceneLevel'>, levels: SceneLevels): string | null {
  if (pin.sceneLevel === undefined || !hasLevels(levels)) return null;
  return resolveLevel(levels, pin.sceneLevel);
}
