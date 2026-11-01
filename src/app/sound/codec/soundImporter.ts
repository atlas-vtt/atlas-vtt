import { SoundImportError } from './demux/demuxTypes';
import type { ImportProgress, SoundImportJob, SoundImportResult } from './soundConvert';
import type { SoundImportMessage } from './soundImportProtocol';
import SoundImportWorker from './soundImportWorker?worker&inline';

export { SoundImportError } from './demux/demuxTypes';
export type { SoundRefusal } from './demux/demuxTypes';
export type { ImportProgress, SoundImportJob, SoundImportKind, SoundImportResult } from './soundConvert';

/**
 * Converts vault files to Atlas' Ogg Opus, one at a time, each in a worker of its own that is stopped when it
 * is done, which gives everything it held back. A bulk import just queues up. The owner disposes it on unload.
 */
export class SoundImporter {
  private line: Promise<unknown> = Promise.resolve();
  private running: Worker | null = null;
  private disposed = false;

  run(job: SoundImportJob, onProgress?: ImportProgress, signal?: AbortSignal): Promise<SoundImportResult> {
    const result = this.line.then(() => this.convert(job, onProgress, signal));
    this.line = result.catch(() => undefined);
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.running?.terminate();
    this.running = null;
  }

  private convert(job: SoundImportJob, onProgress?: ImportProgress, signal?: AbortSignal): Promise<SoundImportResult> {
    if (this.disposed) return Promise.reject(new SoundImportError('unreadable', 'Sound import has stopped.'));
    if (signal?.aborted) return Promise.reject(new DOMException('The import was cancelled.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const worker = new SoundImportWorker({ name: 'Atlas sound import' });
      this.running = worker;
      const finish = (): void => {
        worker.terminate();
        if (this.running === worker) this.running = null;
        signal?.removeEventListener('abort', aborted);
      };
      const aborted = (): void => {
        finish();
        reject(new DOMException('The import was cancelled.', 'AbortError'));
      };
      signal?.addEventListener('abort', aborted);
      worker.onmessage = (event: MessageEvent<SoundImportMessage>): void => {
        const message = event.data;
        if (message.type === 'progress') {
          onProgress?.(message.share);
          return;
        }
        finish();
        if (message.type === 'done') resolve(message.result);
        else reject(new SoundImportError(message.reason, message.detail));
      };
      worker.onerror = (event): void => {
        finish();
        reject(new SoundImportError('unreadable', event.message));
      };
      worker.postMessage(job);
    });
  }
}
