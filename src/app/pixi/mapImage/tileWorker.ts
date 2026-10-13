import { browserTileCore, hostTileCore } from './tileCoreHost';
import type { TileRequest } from './tileProtocol';

/** Entry of the map tile worker that `TileDecoderClient` runs. Bundled inline into main.js by Vite. */

const host = hostTileCore(browserTileCore, (message, transfer) => self.postMessage(message, { transfer }));

self.addEventListener('message', (event: MessageEvent<TileRequest>) => host.receive(event.data));
