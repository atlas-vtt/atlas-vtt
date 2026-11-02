import { SoundImportError } from './demux/demuxTypes';
import type { ImportProgress, SoundImportJob, SoundImportResult } from './soundConvert';
import type { SoundImportMessage } from './soundImportProtocol';
import SoundImportWorker from './soundImportWorker?worker&inline';

export { SoundImportError } from './demux/demuxTypes';
export type { ImportProgress, SoundImportJob, SoundImportResult } from './soundConvert';

/**
 * How long a conversion may go without a step before it counts as stuck. A step is 1 % of the file, or 5 % of reading
 * the copy back. The longest copy there can be (256 MiB at 96 kbit/s, six hours) has 3.7 minutes of sound in 1 %,
 * which gets done in this time at 2.5 times real time; encoders run at 50 and more. The worst a stuck one costs
 * is this long before the next sound in line.
 */
const STUCK_AFTER_MS = 90_000;

/**
 * Converts vault files to Atlas' Ogg Opus, one at a time, each in a worker of its own that is stopped when it
 * is done, which gives everything it held back. A bulk import just queues up. A worker that stops getting
 * anywhere is stopped too and its sound refused, so the next one gets its turn. The owner disposes it on unload.
 */
export class SoundImporter {
  private line: Promise<unknown> = Promise.resolve();
  private stopRunning: (() => void) | null = null;
  private disposed = false;

  run(job: SoundImportJob, onProgress?: ImportProgress, signal?: AbortSignal): Promise<SoundImportResult> {
    const result = this.line.then(() => this.convert(job, onProgress, signal));
    this.line = result.catch(() => undefined);
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.stopRunning?.();
  }

  private convert(job: SoundImportJob, onProgress?: ImportProgress, signal?: AbortSignal): Promise<SoundImportResult> {
    if (this.disposed) return Promise.reject(new SoundImportError('unreadable', 'Sound import has stopped.'));
    if (signal?.aborted) return Promise.reject(new DOMException('The import was cancelled.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const worker = new SoundImportWorker({ name: 'Atlas sound import' });
      let stuck = 0;
      const finish = (): void => {
        worker.terminate();
        self.clearTimeout(stuck);
        this.stopRunning = null;
        signal?.removeEventListener('abort', aborted);
      };
      const refuse = (detail: string): void => {
        finish();
        reject(new SoundImportError('unreadable', detail));
      };
      const aborted = (): void => {
        finish();
        reject(new DOMException('The import was cancelled.', 'AbortError'));
      };
      const watch = (): void => {
        self.clearTimeout(stuck);
        stuck = self.setTimeout(() => refuse(`No step of the conversion in ${STUCK_AFTER_MS} ms.`), STUCK_AFTER_MS);
      };
      this.stopRunning = () => refuse('Sound import has stopped.');
      signal?.addEventListener('abort', aborted);
      worker.onmessage = (event: MessageEvent<SoundImportMessage>): void => {
        const message = event.data;
        if (message.type === 'progress') {
          watch();
          onProgress?.(message.share);
          return;
        }
        finish();
        if (message.type === 'done') resolve(message.result);
        else reject(new SoundImportError(message.reason, message.detail));
      };
      worker.onerror = (event): void => refuse(event.message);
      watch();
      worker.postMessage(job);
    });
  }
}
