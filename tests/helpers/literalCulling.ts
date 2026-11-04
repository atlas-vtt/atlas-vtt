import type { Point } from '../../src/app/types/visionTypes';
import { cornerAt, stopAt, tiesOf, type ReferencePlan } from './visibilityReference';

/**
 * Sweeps built from a reference plan with parts of the culling rules left out, to show that the
 * equivalence checks catch each part missing. With every part, `culledFromPlan` keeps every
 * corner of the full sweep.
 */
export interface CullingRules {
  /** Rebuild hidden corners between two rays on one wall (otherwise every hidden corner is dropped). */
  rebuild: boolean;
  /** Weigh every wall along the run's chord when rebuilding (otherwise only the run's own wall). */
  ties: boolean;
  /** Never rebuild across the ±π seam: runs that wrap or have a ray beyond ±π are cast. */
  seam: boolean;
  /** Never rebuild where a wall seen edge-on is tested: such runs are cast. */
  edgeOn: boolean;
}

export const FULL_RULES: CullingRules = { rebuild: true, ties: true, seam: true, edgeOn: true };

/** The corners of a sweep that follows `rules` over the plan, in the full sweep's order. */
export function culledFromPlan(plan: ReferencePlan, rules: CullingRules): Point[] {
  const { origin } = plan.call;
  const corners: (Point | null)[] = plan.values.map((value, i) => (plan.cast[i] ? cornerAt(origin, value, plan.stops.get(i)!.t) : null));
  for (const gap of plan.gaps) {
    const passes = gap.verdict === 'pass' || (!rules.seam && gap.verdict === 'seam') || (!rules.edgeOn && gap.verdict === 'edge-on');
    if (!rules.rebuild) continue;
    if (!passes) {
      for (const i of gap.inner) corners[i] = cornerAt(origin, plan.values[i]!, stopAt(plan, plan.values[i]!).t);
      continue;
    }
    const ties = rules.ties ? tiesOf(plan, gap) : [plan.stops.get(gap.left)!.wall];
    for (const i of gap.inner) corners[i] = cornerAt(origin, plan.values[i]!, stopAt(plan, plan.values[i]!, ties).t);
  }
  return corners.flatMap((corner, i) => (corner ? Array.from({ length: plan.counts[i]! }, () => ({ ...corner })) : []));
}

/** A sweep that casts no ray towards a hidden wall end and keeps nothing it did not cast. */
export function literalCulling(plan: ReferencePlan): Point[] {
  return culledFromPlan(plan, { ...FULL_RULES, rebuild: false });
}

/** A sweep that rebuilds hidden corners from the run's own wall alone. */
export function withoutTies(plan: ReferencePlan): Point[] {
  return culledFromPlan(plan, { ...FULL_RULES, ties: false });
}

/** A sweep that rebuilds hidden corners across the ±π seam as well. */
export function withoutSeam(plan: ReferencePlan): Point[] {
  return culledFromPlan(plan, { ...FULL_RULES, seam: false });
}

/** A sweep that rebuilds hidden corners where a wall seen edge-on is tested, too. */
export function withoutEdgeOn(plan: ReferencePlan): Point[] {
  return culledFromPlan(plan, { ...FULL_RULES, edgeOn: false });
}
