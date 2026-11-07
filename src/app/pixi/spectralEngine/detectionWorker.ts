/** Entry of the grid detection worker that `SpectralEngineClient` runs. Bundled inline into main.js by Vite. */

import { grayOfBitmap } from './detectGrid';
import type { MapGray } from './detectGrid';
import { NO_GRID, runDetection } from './detectionJob';
import type { DetectionReply, DetectionRequest } from './detectionProtocol';

/** The image of the last job: a panel asks about one map many times, and its spectra are kept with it. */
let held: { key: number; gray: MapGray } | null = null;

/** Answers the client; the buffers in `transfer` are handed over, not copied. */
function post(reply: DetectionReply, transfer: Transferable[] = []): void {
  self.postMessage(reply, { transfer });
}

self.addEventListener('message', ({ data }: MessageEvent<DetectionRequest>) => {
  const { id, imageKey, gray, picture, candidates, ink, lines } = data;
  try {
    if (gray) held = { key: imageKey, gray };
    if (picture) {
      // Read here, where it holds no frame of the window's.
      const read = grayOfBitmap(picture.bitmap, picture.size, new OffscreenCanvas(1, 1));
      held = read ? { key: imageKey, gray: read } : null;
      if (!read) {
        post({ id, outcome: NO_GRID });
        return;
      }
    }
    if (held?.key !== imageKey) throw new Error('The map image of this detection was never sent.');
    const outcome = runDetection({ gray: held.gray, ink, lines, ...(candidates ? { candidates } : {}) }, (event) => {
      post({ id, event }, event.type === 'ink' ? [event.ink.data.buffer] : []);
    });
    post({ id, outcome }, [...(outcome.hits ? [outcome.hits.buffer] : []), ...(outcome.lines ? [outcome.lines.data.buffer] : [])]);
  } catch (error) {
    post({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
