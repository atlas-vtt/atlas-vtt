/**
 * Workers without Node. Obsidian turns on Node in every dedicated worker (`nodeIntegrationInWorker`),
 * which costs each one some 45 ms before its first message (70 to 100 ms on a busy machine). Electron
 * gives Node to no SharedWorker, which starts in a few: a worker that needs neither Node nor what only
 * dedicated workers have (WebCodecs: `ImageDecoder`, `AudioDecoder`) runs as one, each start with a new
 * Blob URL, so no two share an instance. Where SharedWorker is missing (Android) it runs dedicated.
 */

const CLOSE = 'atlas:close-worker';

/** The page's end of a worker, dedicated or shared. */
export interface WorkerLink<In, Out> {
  post(message: In, transfer?: Transferable[]): void;
  /** `onError`: the worker could not start, or a dedicated one failed. */
  listen(onMessage: (message: Out) => void, onError: () => void): void;
  /** A shared worker ends after the job it is running; a dedicated one at once. */
  stop(): void;
}

export function startNodeFreeWorker<In, Out>(shared: () => SharedWorker, dedicated: () => Worker): WorkerLink<In, Out> {
  if (typeof SharedWorker !== 'function') {
    const worker = dedicated();
    return {
      post: (message, transfer = []) => worker.postMessage(message, transfer),
      listen: (onMessage, onError) => {
        worker.addEventListener('message', (event: MessageEvent<Out>) => onMessage(event.data));
        worker.addEventListener('error', onError);
      },
      stop: () => worker.terminate(),
    };
  }
  const worker = shared();
  const { port } = worker;
  return {
    post: (message, transfer = []) => port.postMessage(message, transfer),
    listen: (onMessage, onError) => {
      port.addEventListener('message', (event: MessageEvent<Out>) => onMessage(event.data));
      worker.addEventListener('error', onError);
      port.start();
    },
    stop: () => {
      port.postMessage(CLOSE);
      port.close();
    },
  };
}

/** The worker's end: answers every message of the page, in a dedicated or a shared worker. */
export function serveWorker<In>(handle: (message: In, reply: (answer: unknown, transfer: Transferable[]) => void) => void): void {
  if (!('onconnect' in self)) {
    self.addEventListener('message', (event: MessageEvent<In>) => handle(event.data, (answer, transfer) => self.postMessage(answer, { transfer })));
    return;
  }
  self.addEventListener('connect', (event) => {
    const port = event instanceof MessageEvent ? event.ports[0] : undefined;
    if (!port) return;
    port.addEventListener('message', (message: MessageEvent<In>) => {
      if (message.data === CLOSE) self.close();
      else handle(message.data, (answer, transfer) => port.postMessage(answer, transfer));
    });
    port.start();
  });
}
