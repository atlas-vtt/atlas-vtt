import { sha256 } from '../utils/hashing';

/** Hashes a sound's source and wraps it as a Blob, both of which copy every byte: on a long file, far more than a frame's time. */
self.onmessage = (event: MessageEvent<ArrayBuffer | Blob>): void => {
  const source = event.data;
  const asBlob = source instanceof Blob ? source : new Blob([source]);
  (source instanceof Blob ? source.arrayBuffer() : Promise.resolve(source)).then(sha256).then(
    (hash) => self.postMessage({ hash, source: asBlob }),
    (error: unknown) => self.postMessage({ error: String(error) }),
  );
};
