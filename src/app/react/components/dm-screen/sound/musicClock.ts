import { SOUND_RATE } from '../../../../sound/engine/soundMath';

/** Whole seconds as `m:ss`, and `h:mm:ss` from an hour on. */
function clockOf(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = twoDigits(seconds % 60);
  if (minutes < 60) return `${minutes}:${rest}`;
  return `${Math.floor(minutes / 60)}:${twoDigits(minutes % 60)}:${rest}`;
}

/** A time on a track, as it counts up: whole seconds gone, so it never shows a second before it has passed. */
export function clock(frames: number): string {
  return clockOf(Math.max(0, Math.floor(frames / SOUND_RATE)));
}

/** How long a track plays, the one way Atlas shows it (as the Armarium does): to the nearest second. */
export function formatLength(seconds: number): string {
  return clockOf(Math.max(0, Math.round(seconds)));
}

/** How long a track of `frames` plays, as `formatLength` shows it. */
export const lengthOfFrames = (frames: number): string => formatLength(frames / SOUND_RATE);

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function writeText(element: HTMLElement | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

/** How often what follows the clock reads it. */
export const POSITION_MS = 250;
/** Under reduced motion: a step a second, as the clock's seconds go. */
export const REDUCED_POSITION_MS = 1000;
