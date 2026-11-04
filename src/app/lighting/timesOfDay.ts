import { t } from '../i18n';

export type TimeOfDay = 'day' | 'dusk' | 'night' | 'dark';

/** The stops of a scene's ambient light, from daylight to pitch black. */
export const TIMES_OF_DAY: { value: TimeOfDay; label: string; ambient: number }[] = [
  { value: 'day', label: t('sceneLight.day'), ambient: 1 },
  { value: 'dusk', label: t('sceneLight.dusk'), ambient: 0.5 },
  { value: 'night', label: t('sceneLight.night'), ambient: 0.15 },
  { value: 'dark', label: t('sceneLight.dark'), ambient: 0 },
];

/** The ambient light of a time of day. */
export function ambientOf(time: TimeOfDay): number {
  return TIMES_OF_DAY.find((stop) => stop.value === time)!.ambient;
}
