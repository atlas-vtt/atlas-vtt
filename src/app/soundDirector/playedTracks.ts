/** Enough to find what played an hour ago; a session is not a history. */
const MAX_PLAYED = 30;

/** The list with `key` as what played last, each track once. */
export function notePlayed(played: readonly string[], key: string): string[] {
  return [key, ...played.filter((other) => other !== key)].slice(0, MAX_PLAYED);
}
