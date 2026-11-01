import { SoundImportError } from './demux/demuxTypes';
import { convertSound } from './soundConvert';
import type { SoundImportMessage, SoundImportRequest } from './soundImportProtocol';

/** Entry of the worker `SoundImporter` runs. Bundled inline into main.js by Vite. */

function reply(message: SoundImportMessage): void {
  self.postMessage(message);
}

self.addEventListener('message', (event: MessageEvent<SoundImportRequest>) => {
  convertSound(event.data, (share) => reply({ type: 'progress', share })).then(
    (result) => reply({ type: 'done', result }),
    (error: unknown) => {
      if (error instanceof SoundImportError) reply({ type: 'failed', reason: error.reason, detail: error.detail });
      else reply({ type: 'failed', reason: 'unreadable', detail: error instanceof Error ? error.message : String(error) });
    },
  );
});
