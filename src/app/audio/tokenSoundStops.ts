import type { SoundDirector } from '../soundDirector/SoundDirector';
import { stopFade } from '../soundDirector/tableSound';

/** What token sounds read of the table's sound: whether Sound is on, whether Stop all holds the table, and when that changes. */
type TableQuiet = Pick<SoundDirector, 'isOn' | 'snapshot' | 'subscribe'>;

/**
 * Fades token sounds out with the table's mix: when Stop all silences it ("Fade out all sound"),
 * and when Sound is switched off. Bring back does not start them again, since they play once, and
 * "Stop music and ambience" leaves them alone, as its name says. A token sound pressed while the
 * silence holds plays: it is a new press. `stopTokenSounds` gets the mix's own stop fade, in
 * seconds, from the GM's fade (`fadeSeconds`). Returns what stops listening.
 */
export function fadeTokenSoundsWithTable(director: TableQuiet, stopTokenSounds: (fadeSeconds: number) => void, fadeSeconds: () => number): () => void {
  let silenced = director.snapshot().mix.table.silenced;
  let on = director.isOn;
  return director.subscribe(() => {
    const nowSilenced = director.snapshot().mix.table.silenced;
    const nowOn = director.isOn;
    const quieted = (nowSilenced && !silenced) || (on && !nowOn);
    silenced = nowSilenced;
    on = nowOn;
    if (quieted) stopTokenSounds(stopFade(fadeSeconds() * 1000) / 1000);
  });
}
