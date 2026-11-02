import type { Mood } from '../sound/soundTypes';
import { getPinIconDefinition, PIN_ICON_PATHS, PIN_PALETTE, PIN_PLACE_GROUPS, PIN_TONES, type PinIconDefinition, type PinIconId, type PinTone, type PinToneName } from '../types/pinIcons';

export const DEFAULT_MOOD_ICON: PinIconId = 'torch';

export const MOOD_TONE_NAMES = Object.keys(PIN_TONES) as PinToneName[];

const isTone = (value: unknown): value is PinToneName => typeof value === 'string' && Object.hasOwn(PIN_TONES, value);

/** The icon a mood file names, where this version has it. */
export function readMoodIcon(value: unknown): PinIconId | undefined {
  return typeof value === 'string' && Object.hasOwn(PIN_ICON_PATHS, value) ? (value as PinIconId) : undefined;
}

export const readMoodTone = (value: unknown): PinToneName | undefined => (isTone(value) ? value : undefined);

/** What a mood's crest can be: every icon the pin palette offers. */
export const MOOD_ICON_CHOICES: readonly PinIconDefinition[] = [
  ...PIN_PALETTE.flatMap((slot) => (slot.kind === 'icon' ? [slot.icon] : [])),
  ...PIN_PLACE_GROUPS.flatMap((group) => group.places),
];

export const moodIcon = (mood: Pick<Mood, 'icon'>): PinIconId => mood.icon ?? DEFAULT_MOOD_ICON;

/** Its own tone, else the one its icon has among pins. */
export function moodTone(mood: Pick<Mood, 'icon' | 'tone'>): PinTone {
  return isTone(mood.tone) ? PIN_TONES[mood.tone] : getPinIconDefinition(moodIcon(mood)).tone;
}
