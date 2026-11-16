import type { ImageJobRequest, ImageJobResponse } from './imageJob';
import { BandUnsupportedError } from './band/bandTypes';
import { renderImageJob, SourceDecodeError } from './imageRenderer';

/** Entry of the image workers that `ImageWorkerPool` runs. Bundled inline into main.js by Vite. */

function reply(response: ImageJobResponse): void {
  self.postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<ImageJobRequest>) => {
  const { id, job } = event.data;
  renderImageJob(job).then(
    (result) => reply({ id, ok: true, result }),
    (error: unknown) => reply({
      id,
      ok: false,
      message: error instanceof Error ? error.message : 'Could not process the image.',
      decodeFailed: error instanceof SourceDecodeError,
      unsupported: error instanceof BandUnsupportedError ? error.reason : undefined,
    }),
  );
});
