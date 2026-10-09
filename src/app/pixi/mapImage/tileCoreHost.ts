import { sha256 } from '../../utils/hashing';
import { indexedDbTileBackend } from './indexedDbTileBackend';
import { MemoryTileBackend } from './memoryTileBackend';
import { browserGraphicsPrimitives, createTileGraphics } from './tileGraphics';
import { TileDecoderCore } from './tileDecoderCore';
import type { TileEvent, TileMessage, TileReply, TileRequest } from './tileProtocol';
import { TileStore, type TileStoreBackend } from './tileStore';

/**
 * Runs a `TileDecoderCore` behind the message protocol: the tile worker's
 * body, and the same on the main thread where no worker starts.
 */

export type PostMessage = (message: TileMessage, transfer: Transferable[]) => void;
export type CoreFactory = (appId: string | null, emit: (event: TileEvent) => void) => Promise<TileDecoderCore>;

/** A macrotask, so messages queued meanwhile run first. `self`: in the worker there is no `window`. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => self.setTimeout(resolve, 0));
}

async function quota(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  return (await navigator.storage.estimate()).quota ?? null;
}

/** The vault's IndexedDB cache, or one in memory where IndexedDB cannot be opened (a private profile, a failed upgrade). */
async function openBackend(appId: string | null): Promise<TileStoreBackend> {
  if (appId === null || typeof indexedDB === 'undefined') return new MemoryTileBackend();
  const backend = indexedDbTileBackend(appId, indexedDB);
  try {
    await backend.listManifests();
    return backend;
  } catch {
    await backend.close();
    return new MemoryTileBackend();
  }
}

/** A core over this global scope's IndexedDB, image decoding and canvases. */
export const browserTileCore: CoreFactory = async (appId, emit) => {
  const store = new TileStore({ backend: await openBackend(appId), estimateQuota: quota });
  return new TileDecoderCore({
    store,
    graphics: createTileGraphics(browserGraphicsPrimitives()),
    sha256,
    yieldToMessages: nextTask,
    emit,
  });
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns the handler for requests; every reply and event goes out through `post`. */
export function hostTileCore(createCore: CoreFactory, post: PostMessage): (request: TileRequest) => void {
  let core: Promise<TileDecoderCore> | null = null;
  const reply = (answer: TileReply, transfer: Transferable[] = []): void => post(answer, transfer);

  const handle = async (request: TileRequest, ready: TileDecoderCore): Promise<void> => {
    switch (request.type) {
      case 'init':
        return;
      case 'open': {
        const outcome = await ready.open(request.identity, request.bytes);
        if (outcome.kind === 'opened') reply({ type: 'opened', id: request.id, opened: outcome.opened });
        else if (outcome.kind === 'need-bytes') reply({ type: 'need-bytes', id: request.id });
        else reply({ type: 'open-failed', id: request.id, failure: outcome.failure });
        return;
      }
      case 'prebuild': {
        const outcome = await ready.prebuild(request.identity, request.bytes);
        if (outcome.kind === 'prebuilt') reply({ type: 'prebuilt', id: request.id, hash: outcome.hash, complete: outcome.complete });
        else if (outcome.kind === 'need-bytes') reply({ type: 'need-bytes', id: request.id });
        else reply({ type: 'open-failed', id: request.id, failure: outcome.failure });
        return;
      }
      case 'tile':
      case 'overview': {
        try {
          const bitmap = request.type === 'tile'
            ? await ready.tile(request.id, request.handle, request.ref)
            : await ready.overview(request.id, request.handle, request.maxSide);
          if (bitmap) reply({ type: 'bitmap', id: request.id, bitmap }, [bitmap]);
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
        await ready.clearCache();
        reply({ type: 'cleared', id: request.id });
        return;
    }
  };

  return (request) => {
    if (request.type === 'init') core ??= createCore(request.appId, (event) => post(event, []));
    const started = core ?? createCore(null, (event) => post(event, []));
    core = started;
    void started.then((ready) => handle(request, ready)).catch((error: unknown) => {
      if ('id' in request && request.type !== 'cancel') reply({ type: 'error', id: request.id, message: message(error) });
    });
  };
}
