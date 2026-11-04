/**
 * Block ids while a template is read. A block keeps its own id when it is well
 * formed and no block before it took it; every other block gets one derived
 * from its place in the file, so reading the same file always gives the same
 * ids and parsing stays pure. Derived ids are handed out once the whole tree is
 * read, so they never take an id a later block holds in the file.
 */

import { describeValue } from './jsonValues';

const BLOCK_ID = /^[0-9a-z]{8}$/;
const ID_SPACE = 36 ** 8;

/** 8 lowercase base36 characters. */
export function isBlockId(value: unknown): value is string {
  return typeof value === 'string' && BLOCK_ID.test(value);
}

/** An id for the block at `path` (indexes from the layout down); `attempt` moves past ids already taken. */
export function derivedBlockId(path: readonly number[], attempt: number): string {
  const seed = attempt === 0 ? path.join('.') : `${path.join('.')}#${attempt}`;
  return (hash53(seed) % ID_SPACE).toString(36).padStart(8, '0');
}

/** cyrb53: a fast 53-bit string hash, deterministic across platforms. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

interface Pending {
  block: { id: string };
  path: readonly number[];
}

export class BlockIdAllocator {
  private readonly taken = new Set<string>();
  private readonly pending: Pending[] = [];

  constructor(private readonly problems: string[]) {}

  /** The block's own id when it is well formed and free, else null (the block then waits for `assign`). */
  claim(raw: unknown, where: string): string | null {
    if (raw === undefined) return null;
    if (!isBlockId(raw)) {
      this.problems.push(`${where}: its id ${describeValue(raw)} is not 8 lowercase letters or digits; it gets a new one.`);
      return null;
    }
    if (this.taken.has(raw)) {
      this.problems.push(`${where}: its id "${raw}" is already used by another block; it gets a new one.`);
      return null;
    }
    this.taken.add(raw);
    return raw;
  }

  /** Gives `block` a derived id in `assign`. */
  defer(block: { id: string }, path: readonly number[]): void {
    this.pending.push({ block, path });
  }

  /** Hands out the derived ids, in the order the blocks were read. */
  assign(): void {
    for (const { block, path } of this.pending) {
      let attempt = 0;
      let id = derivedBlockId(path, attempt);
      while (this.taken.has(id)) {
        attempt += 1;
        id = derivedBlockId(path, attempt);
      }
      this.taken.add(id);
      block.id = id;
    }
    this.pending.length = 0;
  }
}
