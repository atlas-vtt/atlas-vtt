import SoundPeaksWorker from './soundPeaksWorker?worker&inline';

export interface PeaksRequest {
  copy: Blob;
  frames: number;
}

export type PeaksMessage = { peaks: Uint8Array<ArrayBuffer> } | { failed: string };

/** A sound's waveform, in a worker of its own that is stopped when it is done. */
export function readSoundPeaks(copy: Blob, frames: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const worker = new SoundPeaksWorker({ name: 'Atlas sound waveform' });
    worker.onmessage = (event: MessageEvent<PeaksMessage>): void => {
      worker.terminate();
      if ('peaks' in event.data) resolve(event.data.peaks);
      else reject(new Error(event.data.failed));
    };
    worker.onerror = (event): void => {
      worker.terminate();
      reject(new Error(event.message));
    };
    const request: PeaksRequest = { copy, frames };
    worker.postMessage(request);
  });
}
