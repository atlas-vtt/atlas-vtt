/** A file read by its ranges, so only what is asked for leaves the disk. */
export interface FileRanges {
  readonly size: number;
  /** The bytes from `start` up to `end` or the file's end, whichever comes first. */
  read(start: number, end: number): Promise<Uint8Array>;
}

/** A file in memory, or a Blob, as ranges: nothing is copied but the ranges read. */
export function rangesOf(file: Blob | ArrayBuffer): FileRanges {
  if ('byteLength' in file) {
    return { size: file.byteLength, read: (start, end) => Promise.resolve(new Uint8Array(file, start, Math.max(0, Math.min(end, file.byteLength) - start))) };
  }
  return { size: file.size, read: async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()) };
}

export const isRanges = (file: Blob | FileRanges): file is FileRanges => typeof (file as Partial<FileRanges>).read === 'function';
