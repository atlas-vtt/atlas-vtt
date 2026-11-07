import { readPeaksOfCopy } from './soundPeaks';
import type { PeaksMessage, PeaksRequest } from './soundPeaksClient';

/** Entry of the worker `readSoundPeaks` runs. Bundled inline into main.js by Vite. */

function reply(message: PeaksMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

self.addEventListener('message', (event: MessageEvent<PeaksRequest>) => {
  readPeaksOfCopy(event.data.copy, event.data.frames, () => reply({ step: true })).then(
    (peaks) => reply({ peaks }, [peaks.buffer]),
    (error: unknown) => reply({ failed: error instanceof Error ? error.message : String(error) }),
  );
});
