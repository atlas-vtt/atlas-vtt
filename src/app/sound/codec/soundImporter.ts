import { SoundImportError } from './demux/demuxTypes';
import type { ImportProgress, SoundImportJob, SoundImportResult, StreamSink } from './soundConvert';
import type { SoundImportMessage } from './soundImportProtocol';
import SoundImportWorker from './soundImportWorker?worker&inline';
import { STUCK_AFTER_MS } from './stuckWatch';

export { SoundImportError } from './demux/demuxTypes';
export type { ImportProgress, SoundImportJob, SoundImportResult, StreamSink } from './soundConvert';

/**
 * Converts vault files to Atlas' Ogg Opus, each in a worker of its own that is stopped when it is done, which
 * gives everything it held back. Every call runs at once: how many run together is the caller's to say
 * (`SoundCopies`). A worker that stops getting anywhere is stopped too and its sound refused. The owner
 * disposes it on unload, which stops every worker still running.
 */
export class SoundImporter {
  private readonly running = new Set<() => void>();
  private disposed = false;

  /** `sink` hears the copy's pages as they are written, where the job asks to stream. */
  run(job: SoundImportJob, onProgress?: ImportProgress, sink?: StreamSink, signal?: AbortSignal): Promise<SoundImportResult> {
    return this.convert(job, onProgress, sink, signal);
  }

  dispose(): void {
    this.disposed = true;
    for (const stop of [...this.running]) stop();
  }

  private convert(job: SoundImportJob, onProgress?: ImportProgress, sink?: StreamSink, signal?: AbortSignal): Promise<SoundImportResult> {
    if (this.disposed) return Promise.reject(new SoundImportError('unreadable', 'Sound import has stopped.'));
    if (signal?.aborted) return Promise.reject(new DOMException('The import was cancelled.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const worker = new SoundImportWorker({ name: 'Atlas sound import' });
      let stuck = 0;
      const finish = (): void => {
        worker.terminate();
        self.clearTimeout(stuck);
        this.running.delete(stop);
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
      const stop = (): void => refuse('Sound import has stopped.');
      this.running.add(stop);
      signal?.addEventListener('abort', aborted);
      worker.onmessage = (event: MessageEvent<SoundImportMessage>): void => {
        const message = event.data;
        if (message.type === 'progress') {
          watch();
          onProgress?.(message.share);
          return;
        }
        if (message.type === 'start') {
          sink?.start(message.start);
          return;
        }
        if (message.type === 'pages') {
          watch();
          sink?.pages(message.pages);
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
