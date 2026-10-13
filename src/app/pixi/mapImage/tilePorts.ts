import { browserTileCore, hostTileCore, type CoreFactory } from './tileCoreHost';
import type { TileMessage, TileRequest } from './tileProtocol';

/** Where `TileDecoderClient` sends its requests: the tile worker, or the same core on the main thread. */
export interface TilePort {
  post(request: TileRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export type PortFactory = (receive: (message: TileMessage) => void, crash: (message: string) => void) => TilePort;

/** A dedicated worker; throws where none can start. */
export function workerPort(createWorker: () => Worker): PortFactory {
  return (receive, crash) => {
    const worker = createWorker();
    worker.addEventListener('message', (event: MessageEvent<TileMessage>) => receive(event.data));
    worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      crash(event.message || 'The map tile worker stopped unexpectedly.');
    });
    worker.addEventListener('messageerror', () => crash('Could not read the map tile worker’s reply.'));
    return {
      post: (request, transfer) => worker.postMessage(request, transfer),
      terminate: () => worker.terminate(),
    };
  };
}

/**
 * The core on this thread, for where workers cannot start: maps still open
 * and tiles are still cached, at the cost of decoding on the main thread.
 * Messages are delivered a task later, as a worker's would be.
 */
export function inThreadPort(createCore: CoreFactory = browserTileCore): PortFactory {
  return (receive) => {
    let stopped = false;
    const host = hostTileCore(createCore, (message) => {
      if (!stopped) window.setTimeout(() => receive(message), 0);
      else if (message.type === 'bitmap') message.bitmap.close();
    });
    return {
      post: (request) => {
        if (!stopped) window.setTimeout(() => host.receive(request), 0);
      },
      // As a worker's end would: its builds stop and its cache's connection closes.
      terminate: () => {
        stopped = true;
        void host.dispose().catch((error: unknown) => console.debug('[Atlas] The map tile cache did not close cleanly', error));
      },
    };
  };
}
