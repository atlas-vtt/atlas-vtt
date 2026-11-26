import type { SoundDirector } from '../soundDirector/SoundDirector';

/** What token sounds read of the table's sound: whether Stop all holds the table, and when that changes. */
type TableQuiet = Pick<SoundDirector, 'snapshot' | 'subscribe'>;

/**
 * Fades token sounds out with the table's mix when Stop all silences it ("Fade out all sound"),
 * over the silence's own fade. Bring back does not start them again, since they play once, and
 * "Stop music and ambience" leaves them alone, as its name says. A token sound pressed while the
 * silence holds plays: it is a new press. `stopTokenSounds` gets the fade in seconds. Returns what
 * stops listening.
 */
export function fadeTokenSoundsWithTable(director: TableQuiet, stopTokenSounds: (fadeSeconds: number) => void): () => void {
  let silenced = director.snapshot().mix.table.silenced;
  return director.subscribe(() => {
    const { table } = director.snapshot().mix;
    if (table.silenced && !silenced) stopTokenSounds(table.silenceFade.ms / 1000);
    silenced = table.silenced;
  });
}
