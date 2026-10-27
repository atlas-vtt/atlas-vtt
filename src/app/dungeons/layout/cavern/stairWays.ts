/** How a cave's floors are joined: a long stairwell is mostly a scree slope, a short one mostly a pitch (a shaft on a rope, an aven seen from below). */

import type { DungeonStair, StairWay } from '../../model';
import { type Rng, chance } from '../../rng';

/** The share of long stairwells that are scree, and of short ones that are pitches. */
const LIKELY = 0.7;

/** Gives both ends of every stairwell its way. */
export function stairWays(rng: Rng, floors: readonly { stairs: DungeonStair[] }[]): void {
  const links = [...new Set(floors.flatMap((floor) => floor.stairs.map((s) => s.link)))].sort((a, b) => a - b);
  for (const link of links) {
    const ends = floors.flatMap((floor) => floor.stairs.filter((s) => s.link === link));
    const first = ends[0];
    if (!first) continue;
    const long = (first.down.x !== 0 ? first.w : first.h) >= 3;
    const likely = chance(rng, LIKELY);
    const way: StairWay = long === likely ? 'scree' : 'pitch';
    for (const end of ends) end.way = way;
  }
}
