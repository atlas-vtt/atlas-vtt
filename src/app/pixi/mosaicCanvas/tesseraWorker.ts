import { browserTesseraCore, hostTesseraCore } from './tesseraCoreHost';
import type { TesseraRequest } from './tesseraProtocol';

/** Entry of the map tessera worker that `TesseraDecoderClient` runs. Bundled inline into main.js by Vite. */

const host = hostTesseraCore(browserTesseraCore, (message, transfer) => self.postMessage(message, { transfer }));

self.addEventListener('message', (event: MessageEvent<TesseraRequest>) => host.receive(event.data));
