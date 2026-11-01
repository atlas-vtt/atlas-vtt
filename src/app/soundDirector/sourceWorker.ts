import { sha256 } from '../utils/hashing';

/** Hashes a sound's source and wraps it as a Blob, both of which copy every byte: on a long file, far more than a frame's time. */
self.onmessage = (event: MessageEvent<ArrayBuffer>): void => {
  const buffer = event.data;
  sha256(buffer).then(
    (hash) => self.postMessage({ hash, source: new Blob([buffer]) }),
    (error: unknown) => self.postMessage({ error: String(error) }),
  );
};
