import SoundPeaksWorker from './soundPeaksWorker?worker&inline';
import { untilStuck } from './stuckWatch';

export interface PeaksRequest {
  copy: Blob;
  frames: number;
}

export type PeaksMessage = { peaks: Uint8Array<ArrayBuffer> } | { failed: string } | { step: true };

/** A sound's waveform, in a worker of its own that is stopped when it is done, or when it stops getting anywhere. */
export function readSoundPeaks(copy: Blob, frames: number): Promise<Uint8Array<ArrayBuffer>> {
  const worker = new SoundPeaksWorker({ name: 'Atlas sound waveform' });
  return untilStuck('reading a waveform', (step) => new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<PeaksMessage>): void => {
      if ('step' in event.data) {
        step();
        return;
      }
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
  }), () => worker.terminate());
}
