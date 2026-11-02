import { sha256 } from '../../utils/hashing';
import { indexedDbTesseraBackend } from './indexedDbTesseraBackend';
import { MemoryTesseraBackend } from './memoryTesseraBackend';
import { browserGraphicsPrimitives, createTesseraGraphics } from './tesseraGraphics';
import { TesseraDecoderCore } from './tesseraDecoderCore';
import type { TesseraEvent, TesseraMessage, TesseraReply, TesseraRequest } from './tesseraProtocol';
import { TesseraStore, type TesseraStoreBackend } from './tesseraStore';

/**
 * Runs a `TesseraDecoderCore` behind the message protocol: the tessera worker's
 * body, and the same on the main thread where no worker starts.
 */

export type PostMessage = (message: TesseraMessage, transfer: Transferable[]) => void;
export type CoreFactory = (appId: string | null, emit: (event: TesseraEvent) => void) => Promise<TesseraDecoderCore>;

/** A macrotask, so messages queued meanwhile run first. `self`: in the worker there is no `window`. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => self.setTimeout(resolve, 0));
}

async function quota(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  return (await navigator.storage.estimate()).quota ?? null;
}

/** The vault's IndexedDB cache, or one in memory where IndexedDB cannot be opened (a private profile, a failed upgrade). */
async function openBackend(appId: string | null): Promise<TesseraStoreBackend> {
  if (appId === null || typeof indexedDB === 'undefined') return new MemoryTesseraBackend();
  const backend = indexedDbTesseraBackend(appId, indexedDB);
  try {
    await backend.listManifests();
    return backend;
  } catch {
    await backend.close();
    return new MemoryTesseraBackend();
  }
}

/** A core over this global scope's IndexedDB, image decoding and canvases. */
export const browserTesseraCore: CoreFactory = async (appId, emit) => {
  const store = new TesseraStore({ backend: await openBackend(appId), estimateQuota: quota });
  return new TesseraDecoderCore({
    store,
    graphics: createTesseraGraphics(browserGraphicsPrimitives()),
    sha256,
    yieldToMessages: nextTask,
    emit,
  });
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface TesseraCoreHost {
  receive(request: TesseraRequest): void;
  /** Stops the core's builds and closes its cache; later requests are ignored. */
  dispose(): Promise<void>;
}

/** Hosts a core behind the protocol; every reply and event goes out through `post`. */
export function hostTesseraCore(createCore: CoreFactory, post: PostMessage): TesseraCoreHost {
  let core: Promise<TesseraDecoderCore> | null = null;
  let disposed = false;
  const reply = (answer: TesseraReply, transfer: Transferable[] = []): void => post(answer, transfer);

  const handle = async (request: TesseraRequest, ready: TesseraDecoderCore): Promise<void> => {
    switch (request.type) {
      case 'init':
        return;
      case 'open': {
        const outcome = await ready.open(request.identity, request.bytes, request.decoded ?? null);
        if (outcome.kind === 'opened') reply({ type: 'opened', id: request.id, opened: outcome.opened });
        else if (outcome.kind === 'need-bytes') reply({ type: 'need-bytes', id: request.id });
        else reply({ type: 'open-failed', id: request.id, failure: outcome.failure });
        return;
      }
      case 'prebuild': {
        const outcome = await ready.prebuild(request.identity, request.bytes, request.decoded ?? null);
        if (outcome.kind === 'prebuilt') reply({ type: 'prebuilt', id: request.id, hash: outcome.hash, complete: outcome.complete, stored: outcome.stored });
        else if (outcome.kind === 'need-bytes') reply({ type: 'need-bytes', id: request.id });
        else reply({ type: 'open-failed', id: request.id, failure: outcome.failure });
        return;
      }
      case 'tessera':
      case 'overview':
      case 'window': {
        try {
          const bitmap = request.type === 'tessera'
            ? await ready.tessera(request.id, request.handle, request.ref)
            : request.type === 'window'
              ? await ready.window(request.id, request.handle, request.rect, request.maxSide)
              : await ready.overview(request.id, request.handle, request.maxSide);
          if (bitmap) reply({ type: 'bitmap', id: request.id, bitmap }, [bitmap]);
        } catch (error) {
          reply({ type: 'error', id: request.id, message: message(error) });
        }
        return;
      }
      case 'alpha-raster': {
        try {
          const raster = await ready.alphaRaster(request.id, request.handle, request.maxSide, request.threshold);
          if (raster) reply({ type: 'alpha-raster', id: request.id, raster }, [raster.opaque.buffer]);
        } catch (error) {
          reply({ type: 'error', id: request.id, message: message(error) });
        }
        return;
      }
      case 'roof-pieces': {
        try {
          const pieces = await ready.roofPieces(request.id, request.handle, request.maxSide);
          if (pieces) reply({ type: 'roof-pieces', id: request.id, pieces }, [pieces.ids.buffer]);
        } catch (error) {
          reply({ type: 'error', id: request.id, message: message(error) });
        }
        return;
      }
      case 'cancel':
        ready.cancel(request.id);
        return;
      case 'close':
        ready.close(request.handle);
        return;
      case 'cache-size':
        reply({ type: 'cache-size', id: request.id, bytes: await ready.cacheSize() });
        return;
      case 'clear-cache':
        reply({ type: 'cleared', id: request.id, bytes: await ready.clearCache() });
        return;
      case 'level-ready': {
        try {
          const level = await ready.levelReady(request.id, request.hash, request.level);
          if (level) reply({ type: 'level-ready', id: request.id, level });
        } catch (error) {
          reply({ type: 'error', id: request.id, message: message(error) });
        }
        return;
      }
      case 'tessera-blobs': {
        const blobs = await ready.tesseraBlobs(request.hash, request.tesserae);
        reply({ type: 'tessera-blobs', id: request.id, blobs }, blobs.filter((blob): blob is ArrayBuffer => blob !== null));
        return;
      }
    }
  };

  const start = (appId: string | null): Promise<TesseraDecoderCore> => {
    const started = createCore(appId, (event) => post(event, []));
    // Before any reply: the client counts a worker that fails before this as one that never started.
    void started.then(() => post({ type: 'ready' }, []), () => undefined);
    return started;
  };

  return {
    receive: (request) => {
      if (disposed) return;
      if (request.type === 'init') core ??= start(request.appId);
      const started = core ?? start(null);
      core = started;
      void started.then((ready) => handle(request, ready)).catch((error: unknown) => {
        if ('id' in request && request.type !== 'cancel') reply({ type: 'error', id: request.id, message: message(error) });
      });
    },
    dispose: async () => {
      disposed = true;
      await core?.then((ready) => ready.dispose(), () => undefined);
    },
  };
}
