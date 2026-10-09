import { TileOpenError } from './tileErrors';
import { TileWorkerCrash } from './tilePortKeeper';
import type { FileIdentity, TileReply, TileRequest } from './tileProtocol';

/**
 * How `TileDecoderClient` opens (or prebuilds) a map: by identity first, with
 * the file's bytes only when the worker asks for them, and once more when the
 * worker ended while it held the open.
 */

/**
 * The file's bytes, or how to read them (`vault.readBinary`; never a fetch of
 * a resource URL). They are transferred to the worker, so the caller's buffer
 * is empty afterwards. A reader is called only when the cache cannot serve the map.
 */
export type BytesSource = ArrayBuffer | (() => Promise<ArrayBuffer>);

/** Decodes a file's bytes on the main thread, for images a worker cannot decode. */
export type MainThreadDecode = (bytes: ArrayBuffer) => Promise<ImageBitmap>;

/** The client's side of one request and its reply. */
export interface OpenExchange {
  nextId(): number;
  request(message: Extract<TileRequest, { type: 'open' | 'prebuild' }>, transfer: Transferable[]): Promise<TileReply>;
}

export interface OpenRequest {
  type: 'open' | 'prebuild';
  source: BytesSource;
  identity: FileIdentity | null;
  decode?: MainThreadDecode;
}

/**
 * The reply to an open or prebuild; rejects with `TileOpenError` when the image cannot be shown.
 * One the worker took along when it ended is sent once more to the next worker (reading the file
 * again), so a crash elsewhere or a worker that never started fails no open.
 */
export async function openWithRetry(exchange: OpenExchange, open: OpenRequest): Promise<TileReply> {
  try {
    return await openOnce(exchange, open);
  } catch (error) {
    // Bytes handed in are gone once transferred; only a reader can give them again.
    const again = typeof open.source === 'function' || open.source.byteLength > 0;
    if (!(error instanceof TileWorkerCrash) || !again) throw error;
    return openOnce(exchange, open);
  }
}

async function openOnce(exchange: OpenExchange, { type, source, identity, decode }: OpenRequest): Promise<TileReply> {
  const id = exchange.nextId();
  const read = (): Promise<ArrayBuffer> => (typeof source === 'function' ? source() : Promise.resolve(source));
  const send = async (bytes: ArrayBuffer | null): Promise<TileReply> => {
    // Decoded before the bytes are transferred, which empties their buffer.
    const decoded = bytes && decode ? await decode(bytes) : null;
    if (!decoded) return exchange.request({ type, id, identity, bytes }, bytes ? [bytes] : []);
    try {
      return await exchange.request({ type, id, identity, bytes, decoded }, bytes ? [bytes, decoded] : [decoded]);
    } catch (error) {
      // Not taken over by a core (a transferred bitmap is closed already, so this costs nothing).
      decoded.close();
      throw error;
    }
  };
  // Bytes in hand go along at once; a reader waits until the worker asks, unless no identity can stand for them.
  let bytes = typeof source !== 'function' || !identity ? await read() : null;
  let reply = await send(bytes);
  if (reply.type === 'need-bytes' && !bytes) {
    bytes = await read();
    reply = await send(bytes);
  }
  if (reply.type === 'open-failed') throw new TileOpenError(reply.failure);
  if (reply.type === 'error') throw new Error(reply.message);
  if (reply.type === 'need-bytes') throw new Error('Unexpected reply from the map tile worker: need-bytes');
  return reply;
}
