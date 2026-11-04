/**
 * Coarse lattice search: finds size and offset of a grid whose type and rough
 * size are known, close enough for the lattice fit to lock on.
 *
 * A few hundred edges spread over the map are profiled once, a whole cell to
 * either side. Any nearby size and offset just shifts each edge along its normal,
 * so a candidate is scored by reading every profile at the shift it implies: no
 * further image access. Each edge casts one vote of at most 1, which keeps heavy
 * map art from outvoting a faint grid. Edges of one direction share the same
 * shift for a given offset, so their votes are tallied per direction first.
 */

import type { GridType } from '../../grid/GridSystem';
import type { GrayImage } from './grayImage';
import { edgeDirectionKey, edgeResponse, edgeShift, frameOf, latticeEdges, moveCandidate } from './edgeProfile';
import type { LatticeCandidate, LatticeEdge, LatticeFrame } from './edgeProfile';

const SEARCH_EDGES = 800;
/** Rough sizes come from spectral peaks; this is how far off they may be. */
const SIZE_RANGE = 0.03;
const SIZE_STEPS = 30;
/** Offsets are searched on a grid of at most this many positions per axis. */
const MAX_OFFSET_STEPS = 96;

interface ProfiledEdge {
  edge: LatticeEdge;
  /** Response across the edge, scaled so its strongest line counts 1. */
  profile: Float32Array;
}

function profileEdges(image: GrayImage, edges: LatticeEdge[], reach: number, frame: LatticeFrame): ProfiledEdge[] {
  return edges.map((edge) => {
    const profile = edgeResponse(image, edge, reach, 1, frame);
    let max = 0;
    for (const value of profile) max = Math.max(max, value);
    for (let j = 0; j < profile.length; j++) profile[j] = max > 0 ? Math.max(0, profile[j]!) / max : 0;
    return { edge, profile };
  });
}

function readProfile(profile: Float32Array, shift: number): number {
  const at = shift + (profile.length - 1) / 2;
  const i = Math.floor(at);
  if (i < 0 || i + 1 >= profile.length) return 0;
  const f = at - i;
  return profile[i]! * (1 - f) + profile[i + 1]! * f;
}

/** Edges grouped by direction, since an offset shifts all edges of one direction alike. */
function byDirection(profiled: ProfiledEdge[]): ProfiledEdge[][] {
  const groups = new Map<number, ProfiledEdge[]>();
  for (const entry of profiled) {
    const key = edgeDirectionKey(entry.edge);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()];
}

/** `aspect` and `rotation` are the rough shape of the map (see `LatticeCandidate`); the search keeps them. */
export function searchLattice(image: GrayImage, gridType: GridType, roughCellSize: number, aspect = 1, rotation = 0): LatticeCandidate | null {
  const start: LatticeCandidate = { cellSize: roughCellSize, offsetX: 0, offsetY: 0, aspect, rotation };
  // Offsets span one cell; at the map's rim a size change moves edges further still.
  const maxCells = Math.hypot(image.width, image.height / aspect) / 2 / roughCellSize;
  const reach = roughCellSize * (0.75 + SIZE_RANGE * maxCells);
  const edges = latticeEdges(image, gridType, start, reach, SEARCH_EDGES);
  if (edges.length < 6) return null;
  const directions = byDirection(profileEdges(image, edges, reach, frameOf(image, start)));

  const offsetStep = Math.max(1, roughCellSize / MAX_OFFSET_STEPS);
  const offsetSteps = Math.ceil(roughCellSize / offsetStep);
  const tallyHalf = Math.ceil(roughCellSize * 0.75);
  const tallies = directions.map(() => new Float32Array(2 * tallyHalf + 1));

  let best = { score: -1, dx: 0, dy: 0, dSize: 0 };
  for (let s = -SIZE_STEPS; s <= SIZE_STEPS; s++) {
    const dSize = (roughCellSize * SIZE_RANGE * s) / SIZE_STEPS;
    // Votes of each direction as a function of the shift along its normal.
    directions.forEach((group, d) => {
      const tally = tallies[d]!;
      // How far this size moves each edge is the same for every shift tallied.
      const moved = group.map((entry) => edgeShift(entry.edge, 0, 0, dSize));
      for (let u = -tallyHalf; u <= tallyHalf; u++) {
        let sum = 0;
        for (let k = 0; k < group.length; k++) sum += readProfile(group[k]!.profile, u + moved[k]!);
        tally[u + tallyHalf] = sum / group.length;
      }
    });
    for (let iy = 0; iy < offsetSteps; iy++) {
      const dy = (iy - offsetSteps / 2) * offsetStep;
      for (let ix = 0; ix < offsetSteps; ix++) {
        const dx = (ix - offsetSteps / 2) * offsetStep;
        let score = 0;
        directions.forEach((group, d) => {
          const { nx, ny } = group[0]!.edge;
          score += readProfile(tallies[d]!, nx * dx + ny * dy);
        });
        if (score > best.score) best = { score, dx, dy, dSize };
      }
    }
  }
  return moveCandidate(image, start, best.dx, best.dy, best.dSize);
}
