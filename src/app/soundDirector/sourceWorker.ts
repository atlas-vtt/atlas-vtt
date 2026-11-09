import { Sha256 } from '../utils/hashing';

/** Small enough that a worker never holds more of a long file than this (a three-hour WAV is gigabytes). */
const SLICE_BYTES = 8 * 1024 * 1024;

async function hashOf(source: Blob): Promise<string> {
  const hash = new Sha256();
  for (let at = 0; at < source.size; at += SLICE_BYTES) hash.update(new Uint8Array(await source.slice(at, at + SLICE_BYTES).arrayBuffer()));
  return hash.hex();
}

/** Hashes a sound's source and wraps it as a Blob, both of which read every byte: on a long file, far more than a frame's time. */
self.onmessage = (event: MessageEvent<ArrayBuffer | Blob>): void => {
  const source = event.data;
  const asBlob = source instanceof Blob ? source : new Blob([source]);
  hashOf(asBlob).then(
    (hash) => self.postMessage({ hash, source: asBlob }),
    (error: unknown) => self.postMessage({ error: String(error) }),
  );
};
