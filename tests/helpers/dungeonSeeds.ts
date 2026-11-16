/**
 * How many seeded dungeons a generator suite runs. A verification round of a generator change used to
 * take an hour of hundreds of seeds a file; a quarter of them finds the same broken rule, since a rule
 * breaks on a share of seeds. `VITE_DUNGEON_SEEDS=full` runs every seed, once before a change lands.
 * The quick run takes the first seeds of the full sequence, so whatever it finds the full run finds too.
 */
export function dungeonSeeds(full: number, quick: number): number {
  return process.env.VITE_DUNGEON_SEEDS === 'full' ? full : quick;
}

/**
 * The least share a sample of `n` runs may show when `expected` was measured over many more:
 * three standard errors below it. A bound set by hand a tenth of a point under a measurement fails
 * whenever a change reshuffles the seeds; this one widens as the sample shrinks and fails about
 * once in 700 runs of an unchanged generator.
 */
export function shareBound(expected: number, n: number): number {
  return expected - 3 * Math.sqrt((expected * (1 - expected)) / Math.max(1, n));
}
