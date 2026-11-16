import type { Mood } from '../sound/soundTypes';

/** The mood after `id` in its order, wrapping; the first where `id` is none of them. */
export function moodAfter(moods: readonly Mood[], id: string | null): Mood | null {
  return moods[(moods.findIndex((mood) => mood.id === id) + 1) % Math.max(1, moods.length)] ?? null;
}

/**
 * The `order` that puts a mood at `index` among the others, written to that one mood alone: a move
 * touches one file, so a sync conflict can cost at most that move.
 */
export function orderForMove(moods: readonly Mood[], id: string, index: number): number | null {
  const others = moods.filter((mood) => mood.id !== id);
  if (others.length === moods.length) return null;
  const at = Math.max(0, Math.min(others.length, index));
  const before = others[at - 1]?.order;
  const after = others[at]?.order;
  if (before === undefined && after === undefined) return null;
  if (before === undefined) return (after ?? 0) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}
