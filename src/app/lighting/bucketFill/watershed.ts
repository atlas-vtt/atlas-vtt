/**
 * A flood from two markers over a cost map (Meyer's watershed): both grow at once, always into the
 * cheapest pixel either reaches next, and each pixel joins whichever reaches it first, so the two
 * meet along the strongest ridge between them. 4-connected; every region it returns is one piece.
 */

/** Label of a pixel nobody has reached; markers are 1 and 2. */
const NONE = 0;
/** Costs are counted in steps of this much: finer than any edge the bucket tells apart. */
const STEP = 0.5;
const LEVELS = 4096;

/** Floods `labels` (1 and 2 where the markers are, 0 elsewhere) in place over `cost`. */
export function watershed(cost: Float32Array, labels: Uint8Array, width: number, height: number): void {
  const queues: number[][] = Array.from({ length: LEVELS }, () => []);
  const levelOf = (i: number): number => Math.min(LEVELS - 1, Math.max(0, Math.round(cost[i]! / STEP)));
  for (let i = 0; i < labels.length; i++) if (labels[i] !== NONE) queues[levelOf(i)]!.push(i);
  for (let level = 0; level < LEVELS; level++) {
    const queue = queues[level]!;
    // The queue grows while it is read: a neighbour cheaper than this level is taken at this level.
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      const x = i % width;
      const label = labels[i]!;
      const visit = (n: number): void => {
        if (labels[n] !== NONE) return;
        labels[n] = label;
        queues[Math.max(level, levelOf(n))]!.push(n);
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (i >= width) visit(i - width);
      if (i < width * (height - 1)) visit(i + width);
    }
    queue.length = 0;
  }
}
