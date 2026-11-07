import type { LightSource } from '../types/lightingTypes';
import { ambientOf } from './timesOfDay';
import { t } from '../i18n';

/** What of a placed light decides whether it shines. */
type Switched = Pick<LightSource, 'hidden' | 'activeBelowAmbient'>;

/**
 * The ambient level (0–1) at or below which a light that follows the ambient light shines, or
 * undefined for a light that always does: one without a level, with one that is no number, or
 * with full daylight as its level (which the ambient light never exceeds).
 */
export function ambientGate(light: Switched): number | undefined {
  const level = light.activeBelowAmbient;
  return typeof level === 'number' && level < 1 ? Math.max(0, level) : undefined;
}

/** A light that follows the ambient light is out because the scene is too bright for it; the GM did not switch it off. */
export function sleeps(light: Switched, ambient: number): boolean {
  const gate = ambientGate(light);
  return !light.hidden && gate !== undefined && ambient > gate;
}

/** Whether a placed light shines under `ambient` light: switched on, and the scene dark enough for it. */
export function isLightOn(light: Switched, ambient: number): boolean {
  return !light.hidden && !sleeps(light, ambient);
}

export type LightSchedule = 'always' | 'dusk' | 'night' | 'custom';

/** When a placed light may be set to shine: always, or from a time of day on. `level` is its `activeBelowAmbient`. */
export const LIGHT_SCHEDULES: { value: LightSchedule; label: string; level: number | undefined }[] = [
  { value: 'always', label: t('light.schedule.always'), level: undefined },
  { value: 'dusk', label: t('light.schedule.dusk'), level: ambientOf('dusk') },
  { value: 'night', label: t('light.schedule.night'), level: ambientOf('night') },
];

/** The schedule a light is on; a level that is no time of day is named by its share of light. */
export function scheduleOf(light: Switched): { value: LightSchedule; label: string } {
  const gate = ambientGate(light);
  const stop = LIGHT_SCHEDULES.find(({ level }) => level === gate);
  return stop ? { value: stop.value, label: stop.label } : { value: 'custom', label: t('light.schedule.below', { percent: Math.round((gate ?? 0) * 100) }) };
}
