import { SoundImportError } from './demux/demuxTypes';
import { convertSound, type SoundImportJob } from './soundConvert';
import type { GrowingPages, GrowingStart } from './growingCopy';
import type { SoundImportMessage } from './soundImportProtocol';

/** Entry of the worker `SoundImporter` runs. Bundled inline into main.js by Vite. */

function reply(message: SoundImportMessage): void {
  self.postMessage(message);
}

self.addEventListener('message', (event: MessageEvent<SoundImportJob>) => {
  const sink = event.data.stream
    ? {
        start: (start: GrowingStart) => reply({ type: 'start', start }),
        pages: (pages: GrowingPages) => self.postMessage({ type: 'pages', pages } satisfies SoundImportMessage, { transfer: [pages.bytes.buffer] }),
      }
    : null;
  convertSound(event.data, (share) => reply({ type: 'progress', share }), sink).then(
    (result) => reply({ type: 'done', result }),
    (error: unknown) => {
      if (error instanceof SoundImportError) reply({ type: 'failed', reason: error.reason, detail: error.detail });
      else reply({ type: 'failed', reason: 'unreadable', detail: error instanceof Error ? error.message : String(error) });
    },
  );
});
