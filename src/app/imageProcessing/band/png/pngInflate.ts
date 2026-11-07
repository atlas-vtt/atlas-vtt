import type { ByteRange } from './pngChunks';

/**
 * The most compressed bytes handed to the inflater at once. A file may hold its whole image in one
 * IDAT chunk of hundreds of megabytes; feeding it in slices keeps the inflater's output, which it
 * buffers until read, to what one slice expands to.
 */
const INPUT_SLICE = 256 * 1024;

/** The compressed slices of the IDAT chunks, in order, as views of the file. */
function* slices(bytes: Uint8Array, ranges: readonly ByteRange[]): Generator<Uint8Array> {
  for (const { start, end } of ranges) {
    for (let at = start; at < end; at += INPUT_SLICE) yield bytes.subarray(at, Math.min(end, at + INPUT_SLICE));
  }
}

/**
 * Inflates the concatenated IDAT data (a zlib stream, PNG spec 10.1) with the platform's
 * DecompressionStream, yielding the decompressed bytes as they come. Input is pulled only as the
 * output is read, so neither side holds more than a slice's worth. Ending the iteration early
 * cancels the stream, so trailing data after the image's last row is never looked at.
 */
export async function* inflateImageData(bytes: Uint8Array, ranges: readonly ByteRange[]): AsyncGenerator<Uint8Array> {
  const input = slices(bytes, ranges);
  const source = new ReadableStream<Uint8Array>({
    pull(controller): void {
      const next = input.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  }, { highWaterMark: 0 });
  const reader = source.pipeThrough(new DecompressionStream('deflate')).getReader();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        return;
      }
      yield value;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}
