const WINDOW_BYTES = 2 << 20;

/** Reads a blob a little at a time, so that a file of hundreds of megabytes is never in memory whole. */
export class BlobWindow {
  private base = 0;
  private bytes = new Uint8Array(0);

  constructor(readonly blob: Blob) {}

  get size(): number {
    return this.blob.size;
  }

  /**
   * At least `length` bytes at `offset`, or all there are up to the end of the file. The view is valid
   * until the next call.
   */
  async at(offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> {
    const available = this.base + this.bytes.length - offset;
    if (offset < this.base || available < length) {
      const end = Math.min(this.blob.size, offset + Math.max(length, WINDOW_BYTES));
      this.bytes = new Uint8Array(await this.blob.slice(offset, end).arrayBuffer());
      this.base = offset;
    }
    return this.bytes.subarray(offset - this.base, Math.min(this.bytes.length, offset - this.base + Math.max(length, 0)));
  }

  /** As `at`, but everything buffered from there on, for parsers that go on until they run out. */
  async from(offset: number, atLeast: number): Promise<Uint8Array<ArrayBuffer>> {
    await this.at(offset, atLeast);
    return this.bytes.subarray(offset - this.base);
  }
}
