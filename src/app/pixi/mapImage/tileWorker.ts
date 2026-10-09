import { browserTileCore, hostTileCore } from './tileCoreHost';
import type { TileRequest } from './tileProtocol';

/** Entry of the map tile worker that `TileDecoderClient` runs. Bundled inline into main.js by Vite. */

const handle = hostTileCore(browserTileCore, (message, transfer) => self.postMessage(message, { transfer }));

self.addEventListener('message', (event: MessageEvent<TileRequest>) => handle(event.data));
