import { untilStuck } from '../sound/codec/stuckWatch';
import SourceWorker from './sourceWorker?worker&inline';

export interface PreparedSource {
  hash: string;
  source: Blob;
}

type SourceMessage = PreparedSource | { error: string };

/** A sound's source, hashed and ready for the importer, without a copy of it on the main thread: a buffer moves to a worker and is gone from here, a Blob is only named. */
export function prepareSource(source: ArrayBuffer | Blob): Promise<PreparedSource> {
  const worker = new SourceWorker({ name: 'Atlas sound source' });
  return untilStuck('preparing a sound', () => new Promise<PreparedSource>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SourceMessage>): void => {
      worker.terminate();
      const message = event.data;
      if ('error' in message) reject(new Error(message.error));
      else resolve(message);
    };
    worker.onerror = (event): void => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage(source, source instanceof ArrayBuffer ? [source] : []);
  }), () => worker.terminate());
}
