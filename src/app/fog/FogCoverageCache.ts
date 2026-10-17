import type { FogOperation } from '../types/fogTypes';
import { fogCoverage, type FogCoverage } from './fogCoverage';

/** One map view's committed geometry, shared by drawing and membership checks. */
export class FogCoverageCache {
  private coverage: FogCoverage | null = null;
  private operations: Readonly<Record<string, FogOperation>> | undefined;
  /** The record and coverage before the current ones, for `known`. */
  private before: { operations: Readonly<Record<string, FogOperation>>; coverage: FogCoverage | null } | null = null;
  private observed = new WeakSet<object>();
  private mapKey: string | null | undefined;

  /** Invalid committed geometry is null; an empty, valid record has empty coverage. */
  get(operations: Readonly<Record<string, FogOperation>>, mapKey: string | null = null): FogCoverage | null {
    if (mapKey !== this.mapKey) {
      this.reset();
      this.mapKey = mapKey;
    }
    if (operations === this.operations) return this.coverage;
    if (this.operations) this.before = { operations: this.operations, coverage: this.coverage };
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

  /**
   * The coverage of `operations` where this cache worked it out as the current record or the one
   * before, on the map it holds; undefined otherwise. Works nothing out.
   */
  known(operations: Readonly<Record<string, FogOperation>>, mapKey: string | null = null): FogCoverage | null | undefined {
    if (mapKey !== this.mapKey) return undefined;
    if (operations === this.operations) return this.coverage;
    return this.before?.operations === operations ? this.before.coverage : undefined;
  }

  reset(): void {
    this.coverage = null;
    this.operations = undefined;
    this.before = null;
    this.observed = new WeakSet<object>();
    this.mapKey = undefined;
  }
}
