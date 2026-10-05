import type { FogOperation } from '../types/fogTypes';
import { fogCoverage, type FogCoverage } from './fogCoverage';

/** One map view's committed geometry, shared by drawing and membership checks. */
export class FogCoverageCache {
  private coverage: FogCoverage | null = null;
  private operations: Readonly<Record<string, FogOperation>> | undefined;
  private observed = new WeakSet<object>();
  private mapKey: string | null | undefined;

  /** Invalid committed geometry is null; an empty, valid record has empty coverage. */
  get(operations: Readonly<Record<string, FogOperation>>, mapKey: string | null = null): FogCoverage | null {
    if (mapKey !== this.mapKey) {
      this.reset();
      this.mapKey = mapKey;
    }
    if (operations === this.operations) return this.coverage;
    const previous = this.observed.has(operations) ? undefined : this.coverage ?? undefined;
    this.operations = operations;
    this.observed.add(operations);
    try {
      this.coverage = fogCoverage(operations, previous);
    } catch {
      this.coverage = null;
    }
    return this.coverage;
  }

  reset(): void {
    this.coverage = null;
    this.operations = undefined;
    this.observed = new WeakSet<object>();
    this.mapKey = undefined;
  }
}
