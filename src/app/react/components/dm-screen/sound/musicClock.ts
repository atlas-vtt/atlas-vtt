import { SOUND_RATE } from '../../../../sound/engine/soundMath';

export function clock(frames: number): string {
  const seconds = Math.max(0, Math.floor(frames / SOUND_RATE));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function writeText(element: HTMLElement | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

/** How often what follows the clock reads it. */
export const POSITION_MS = 250;
/** Under reduced motion: a step a second, as the clock's seconds go. */
export const REDUCED_POSITION_MS = 1000;
