export const BOUNDARY_RAYS = 64;
/** The sweep casts a ray at each wall end and this far (radians) to either side of it. */
export const RAY_OFFSET = 1e-5;

/** The angle of boundary ray `i`, as the sweep writes it. */
export function boundaryAngle(i: number): number {
  return -Math.PI + (2 * Math.PI * i) / BOUNDARY_RAYS;
}

/**
 * The full sweep's angles as distinct values in its order, with how often each occurs and
 * whether a ray is cast for it. The sweep writes equal corners for equal angles, so each value
 * is worked out once and its corner written as often as the sweep writes it.
 */
export interface RayPlan {
  values: Float64Array;
  counts: Uint32Array;
  /** 1 where a ray is cast: a boundary ray, or an end some ray of which is not hidden. */
  cast: Uint8Array;
  length: number;
}

/** The sorted `list` with each value also less and plus `RAY_OFFSET`, all three in order. */
function withOffsets(list: Float64Array): Float64Array {
  const n = list.length, out = new Float64Array(3 * n);
  let low = 0, mid = 0, high = 0;
  for (let k = 0; k < out.length; k++) {
    const a = low < n ? list[low]! - RAY_OFFSET : Infinity, b = mid < n ? list[mid]! : Infinity, c = high < n ? list[high]! + RAY_OFFSET : Infinity;
    if (a <= b && a <= c) { out[k] = a; low++; } else if (b <= c) { out[k] = b; mid++; } else { out[k] = c; high++; }
  }
  return out;
}

/**
 * The plan for the boundary rays and the wall ends whose bearings are `cast` (the first
 * `castCount`; ends in view) and `culled` (the first `culledCount`; hidden ends): each end gives
 * its bearing and the bearings `RAY_OFFSET` to either side. A value that both give is cast.
 * Sorts both lists in place; the three angles of an end follow from its bearing, so the lists
 * are merged, not sorted three times as long.
 */
export function rayPlan(cast: Float64Array, castCount: number, culled: Float64Array, culledCount: number): RayPlan {
  const seen = withOffsets(cast.subarray(0, castCount).sort()), hidden = withOffsets(culled.subarray(0, culledCount).sort());
  const total = BOUNDARY_RAYS + seen.length + hidden.length;
  const values = new Float64Array(total), counts = new Uint32Array(total), flags = new Uint8Array(total);
  let length = 0, ray = 0, i = 0, j = 0;
  for (let k = 0; k < total; k++) {
    const a = ray < BOUNDARY_RAYS ? boundaryAngle(ray) : Infinity, b = i < seen.length ? seen[i]! : Infinity, c = j < hidden.length ? hidden[j]! : Infinity;
    let value: number, fromCast: number;
    if (a <= b && a <= c) { value = a; fromCast = 1; ray++; } else if (b <= c) { value = b; fromCast = 1; i++; } else { value = c; fromCast = 0; j++; }
    if (length > 0 && values[length - 1] === value) {
      counts[length - 1]!++;
      flags[length - 1]! |= fromCast;
      continue;
    }
    values[length] = value;
    counts[length] = 1;
    flags[length++] = fromCast;
  }
  return { values, counts, cast: flags, length };
}
