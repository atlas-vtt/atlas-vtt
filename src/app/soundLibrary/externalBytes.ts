import type { NodeFsModule } from './nodeFiles';
import { SoundPathTakenError } from './soundLocation';

/** A read's size: a copy into a Blob this size takes well under a frame. */
const CHUNK_BYTES = 1024 * 1024;

/**
 * A file on disk as a Blob, without holding it on the main thread: each chunk is read off the thread,
 * copied into a Blob of its own, which lives in the browser process, and is dropped. `fs.openAsBlob`
 * gives a Node Blob, which no worker of the page can be handed, so it would have to be copied just the same.
 */
export async function readAsBlob(fs: NodeFsModule, absolute: string, onStep?: () => void): Promise<Blob> {
  const handle = await fs.promises.open(absolute, 'r');
  try {
    const parts: Blob[] = [];
    const chunk = new Uint8Array(CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_BYTES, null);
      if (bytesRead === 0) break;
      parts.push(new Blob([chunk.subarray(0, bytesRead)]));
      onStep?.();
    }
    return new Blob(parts);
  } finally {
    await handle.close();
  }
}

const isTaken = (error: unknown): boolean => error instanceof Object && Reflect.get(error, 'code') === 'EEXIST';

/** A Blob as a new file, chunk by chunk. The `wx` flag makes the system refuse a file that is there. */
export async function writeFromBlob(fs: NodeFsModule, absolute: string, content: Blob, shownPath: string): Promise<void> {
  let handle;
  try {
    handle = await fs.promises.open(absolute, 'wx');
  } catch (error) {
    if (isTaken(error)) throw new SoundPathTakenError(shownPath);
    throw error;
  }
  try {
    const reader = content.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let written = 0;
      while (written < value.byteLength) written += (await handle.write(value.subarray(written))).bytesWritten;
    }
  } finally {
    await handle.close();
  }
}
