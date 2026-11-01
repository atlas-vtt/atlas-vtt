import SourceWorker from './sourceWorker?worker&inline';

export interface PreparedSource {
  hash: string;
  source: Blob;
}

type SourceMessage = PreparedSource | { error: string };

/** A sound's source, hashed and ready for the importer, without a copy of it on the main thread: the buffer moves to a worker and is gone from here. */
export function prepareSource(buffer: ArrayBuffer): Promise<PreparedSource> {
  return new Promise((resolve, reject) => {
    const worker = new SourceWorker({ name: 'Atlas sound source' });
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
    worker.postMessage(buffer, [buffer]);
  });
}
