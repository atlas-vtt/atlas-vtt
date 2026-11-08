import type { SoundDirector } from '../soundDirector/SoundDirector';
import { stopFade } from '../soundDirector/tableSound';

/** What token sounds read of the table's sound: whether Sound is on, whether Stop all holds the table, and when that changes. */
type TableQuiet = Pick<SoundDirector, 'isOn' | 'snapshot' | 'subscribe'>;

/**
 * Fades token sounds out with the table's mix, over the fade the mix itself takes: when Stop all
 * silences it ("Fade out all sound"), over the silence's own fade, and when Sound is switched off,
 * over the GM's fade as the switch-off takes it (`fadeSeconds`, at most `stopFade`). Bring back
 * does not start them again, since they play once, and "Stop music and ambience" leaves them alone,
 * as its name says. A token sound pressed while the silence holds plays: it is a new press.
 * `stopTokenSounds` gets the fade in seconds. Returns what stops listening.
 */
export function fadeTokenSoundsWithTable(director: TableQuiet, stopTokenSounds: (fadeSeconds: number) => void, fadeSeconds: () => number): () => void {
  let silenced = director.snapshot().mix.table.silenced;
  let on = director.isOn;
  return director.subscribe(() => {
    const { table } = director.snapshot().mix;
    const nowOn = director.isOn;
    const switchedOff = on && !nowOn;
    const silencedNow = table.silenced && !silenced;
    silenced = table.silenced;
    on = nowOn;
    if (switchedOff) stopTokenSounds(stopFade(fadeSeconds() * 1000) / 1000);
    else if (silencedNow) stopTokenSounds(table.silenceFade.ms / 1000);
  });
}
