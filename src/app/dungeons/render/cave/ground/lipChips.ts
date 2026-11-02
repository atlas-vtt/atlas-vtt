import { hash2 } from '../../art/noise';
import type { Vec } from '../../geometry';
import { facetLight, type Vec3 } from '../../stone/rockFacets';

/** A chip of the rock lip: its two facets, each lit by how it faces the light, and its crack to the next chip. */
export interface LipChip {
  facets: { face: Vec[]; light: number }[];
  crack: [Vec, Vec];
}

/** How finely the lip is cut before it is split into chips, in cells. */
const PIECE = 0.06;
/** How long a chip runs along the wall, in cells. */
const CHIP = { least: 0.16, more: 0.24 };
/** How high the lip's outer edge stands over the floor, in cells. */
const RISE = { least: 0.08, more: 0.1 };

interface Lip {
  inner: Vec[];
  outer: Vec[];
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** A ring and its lip's outer edge, cut into pieces no longer than `PIECE`, the outer edge following its own straight runs. */
function cut(ring: readonly Vec[], outer: readonly Vec[]): Lip {
  const cutInner: Vec[] = [];
  const cutOuter: Vec[] = [];
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const length = Math.hypot(ring[j]!.x - ring[i]!.x, ring[j]!.y - ring[i]!.y);
    const pieces = Math.max(1, Math.ceil(length / PIECE));
    for (let k = 0; k < pieces; k++) {
      cutInner.push(lerp(ring[i]!, ring[j]!, k / pieces));
      cutOuter.push(lerp(outer[i]!, outer[j]!, k / pieces));
    }
  }
  cutInner.push(cutInner[0]!);
  cutOuter.push(cutOuter[0]!);
  return { inner: cutInner, outer: cutOuter };
}

/** The facet between the wall's foot from `innerFrom` to `innerTo` and the lip's edge back from `outerFrom` to `outerTo`. */
function facet(lip: Lip, innerFrom: number, innerTo: number, outerFrom: number, outerTo: number, rise: (k: number) => number): { face: Vec[]; light: number } {
  const face: Vec[] = [];
  const corners: Vec3[] = [];
  for (let k = innerFrom; k <= innerTo; k++) {
    face.push(lip.inner[k]!);
    corners.push({ ...lip.inner[k]!, z: 0 });
  }
  for (let k = outerFrom; k >= outerTo; k--) {
    face.push(lip.outer[k]!);
    corners.push({ ...lip.outer[k]!, z: rise(k) });
  }
  return { face, light: facetLight(corners) };
}

/** Where the chips part: an index on the wall's foot and one on the lip's edge, a piece or two aside, so cracks run aslant. */
function boundaries(lip: Lip, seed: number): { inner: number; outer: number }[] {
  const n = lip.inner.length - 1;
  const out = [{ inner: 0, outer: 0 }];
  let at = 0;
  for (let index = 0; at < n; index++) {
    const target = CHIP.least + hash2(index, 1, seed) * CHIP.more;
    let run = 0;
    let end = at;
    while (end < n && run < target) {
      run += Math.hypot(lip.inner[end + 1]!.x - lip.inner[end]!.x, lip.inner[end + 1]!.y - lip.inner[end]!.y);
      end++;
    }
    // A short rest at the ring's end joins the chip before it.
    if (n - end < 3) end = n;
    const slant = end === n ? 0 : Math.round((hash2(index, 6, seed) - 0.5) * 4.4);
    const last = out[out.length - 1]!;
    out.push({ inner: end, outer: Math.max(last.outer + 1, Math.min(n - 1, end + slant)) });
    if (end === n) out[out.length - 1] = { inner: n, outer: n };
    at = end;
  }
  return out;
}

/**
 * The lip of rock along a cave's wall broken into chips, as a painter blocks in a cliff's foot:
 * each chip split by a ridge into two flat facets that the one light lights or leaves in shade,
 * cracks running aslant between the chips. `outer` is the lip's outer edge at each corner of `ring`.
 */
export function lipChips(ring: readonly Vec[], outer: readonly Vec[], seed: number): LipChip[] {
  const lip = cut(ring, outer);
  const parts = boundaries(lip, seed);
  const chips: LipChip[] = [];
  for (let index = 0; index + 1 < parts.length; index++) {
    const a = parts[index]!;
    const b = parts[index + 1]!;
    const high = RISE.least + hash2(index, 2, seed) * RISE.more;
    const tilt = (hash2(index, 3, seed) - 0.5) * 0.12;
    const facets: LipChip['facets'] = [];
    if (b.inner - a.inner >= 2 && b.outer - a.outer >= 2) {
      // The ridge runs from the wall's foot to the lip's edge and stands highest there, so the two faces lean apart.
      const ridgeIn = a.inner + Math.max(1, Math.floor((b.inner - a.inner) * (0.3 + hash2(index, 4, seed) * 0.4)));
      const ridgeOut = a.outer + Math.max(1, Math.floor((b.outer - a.outer) * (0.3 + hash2(index, 5, seed) * 0.4)));
      const rise = (k: number): number => {
        const along = Math.abs(k - ridgeOut) / Math.max(1, k < ridgeOut ? ridgeOut - a.outer : b.outer - ridgeOut);
        return Math.max(0.02, high * (1.7 - along * 1.1) + tilt * Math.sign(k - ridgeOut));
      };
      facets.push(facet(lip, a.inner, ridgeIn, ridgeOut, a.outer, rise));
      facets.push(facet(lip, ridgeIn, b.inner, b.outer, ridgeOut, rise));
    } else {
      facets.push(facet(lip, a.inner, b.inner, b.outer, a.outer, (k) => Math.max(0.02, high + tilt * (k === a.outer ? -1 : 1))));
    }
    chips.push({ facets, crack: [lip.inner[b.inner]!, lip.outer[b.outer]!] });
  }
  return chips;
}
