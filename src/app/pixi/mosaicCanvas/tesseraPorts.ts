import { browserTesseraCore, hostTesseraCore, type CoreFactory } from './tesseraCoreHost';
import type { TesseraMessage, TesseraRequest } from './tesseraProtocol';

/** Where `TesseraDecoderClient` sends its requests: the tessera worker, or the same core on the main thread. */
export interface TesseraPort {
  post(request: TesseraRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export type PortFactory = (receive: (message: TesseraMessage) => void, crash: (message: string) => void) => TesseraPort;

/** A dedicated worker; throws where none can start. */
export function workerPort(createWorker: () => Worker): PortFactory {
  return (receive, crash) => {
    const worker = createWorker();
    worker.addEventListener('message', (event: MessageEvent<TesseraMessage>) => receive(event.data));
    worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      crash(event.message || 'The map tessera worker stopped unexpectedly.');
    });
    worker.addEventListener('messageerror', () => crash('Could not read the map tessera worker’s reply.'));
    return {
      post: (request, transfer) => worker.postMessage(request, transfer),
      terminate: () => worker.terminate(),
    };
  };
}

/**
 * The core on this thread, for where workers cannot start: maps still open
 * and tesserae are still cached, at the cost of decoding on the main thread.
 * Messages are delivered a task later, as a worker's would be.
 */
export function inThreadPort(createCore: CoreFactory = browserTesseraCore): PortFactory {
  return (receive) => {
    let stopped = false;
    const host = hostTesseraCore(createCore, (message) => {
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
        void host.dispose().catch((error: unknown) => console.debug('[Atlas] The map tessera cache did not close cleanly', error));
      },
    };
  };
}
