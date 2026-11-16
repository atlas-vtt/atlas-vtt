import { SoundImportError } from './demux/demuxTypes';

/**
 * How long work on a sound may go without a step before it counts as stuck. For a conversion a step is 1 % of the
 * file, or 5 % of reading the copy back. The longest copy there can be (256 MiB at 96 kbit/s, six hours) has 3.7
 * minutes of sound in 1 %, which gets done in this time at 2.5 times real time; encoders run at 50 and more. The
 * worst a stuck one costs is this long before the next sound in line.
 */
export const STUCK_AFTER_MS = 90_000;

/**
 * Work that may never answer (a read from a dead network share, a worker gone quiet), refused as unreadable once it has
 * gone `STUCK_AFTER_MS` without calling `step`, so the next sound gets its turn. Nothing can cancel the work itself: what
 * it answers later is dropped. `onStuck` stops what can be stopped.
 */
export function untilStuck<T>(what: string, work: (step: () => void) => Promise<T>, onStuck?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const step = (): void => {
      self.clearTimeout(timer);
      timer = self.setTimeout(() => {
        onStuck?.();
        reject(new SoundImportError('unreadable', `No step of ${what} in ${STUCK_AFTER_MS} ms.`));
      }, STUCK_AFTER_MS);
    };
    step();
    work(step).then(resolve, reject).finally(() => self.clearTimeout(timer));
  });
}
