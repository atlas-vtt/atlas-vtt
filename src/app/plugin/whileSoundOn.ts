import type { SoundDirector } from '../soundDirector/SoundDirector';
import type { SoundLibrary } from '../soundLibrary/SoundLibrary';

/**
 * Runs `start` with the app's library as it is when sound comes on, and its release when sound goes off.
 * Switching sound off releases the library, so nothing may keep the one released: each time sound comes on,
 * whatever follows the library is built anew on the live one. Returns the release.
 */
export function whileSoundOn(
  director: Pick<SoundDirector, 'isOn' | 'subscribe'>,
  library: () => SoundLibrary,
  start: (library: SoundLibrary) => () => void,
): () => void {
  let stop: (() => void) | null = null;
  const follow = (): void => {
    if (director.isOn && !stop) stop = start(library());
    else if (!director.isOn && stop) {
      const stopping = stop;
      stop = null;
      stopping();
    }
  };
  const unsubscribe = director.subscribe(follow);
  follow();
  return () => {
    unsubscribe();
    stop?.();
    stop = null;
  };
}
