/**
 * A long way between two caves laid as a chain of passages: each passage leads on to the next by
 * its far end, turning to one side or running straight on, so a gallery of a hundred feet and more
 * bends where a straight one would cross the floor. Each passage's door rolls its own way (the
 * book's passages shift in their nature: a walk narrows to a crawl for a stretch and opens again).
 * Where no next passage fits, the way ends as the planner would have ended it.
 */

import { MAX_SEED, type Rng, chance, int } from '../../../rng';
import { type Branch, forwardBranch, sideBranch } from '../../branches';
import type { WorkRoom } from '../../workLayout';
import { type ExitRules, rollLoopWay } from './caveExits';

/** How often a way turns between two of its passages rather than running straight on. */
const TURN_CHANCE = 2 / 3;

const ahead = (room: WorkRoom, branch: Branch): boolean => branch.axis.x === room.axis.x && branch.axis.y === room.axis.y;

/** The next passages' branches from the far end of `room`, tried in turn: a turn to either side or straight on. */
function nextPassages(rng: Rng, room: WorkRoom, flip: boolean, route: readonly number[], rules: ExitRules): Branch[] {
  const exit = rollLoopWay(rng, rules);
  const side = chance(rng, 0.5) ? 1 : -1;
  const turnFirst = chance(rng, TURN_CHANCE);
  const seed = int(rng, 1, MAX_SEED);
  // The turn leaves by a side wall beside the far end, so the bend is a corner, not a fork.
  const last = room.depth - 2;
  const turn = sideBranch(room, side, last, flip, seed);
  const straight = forwardBranch(room, 0, flip, seed);
  const other = sideBranch(room, side === 1 ? -1 : 1, last, flip, seed);
  return (turnFirst ? [turn, straight, other] : [straight, turn, other]).map((branch) => ({ ...branch, exit, route }));
}

/**
 * A passage's branches with the rest of its way laid on from its far end (`route`, the passages
 * still to lay): the next passage comes first, and the branch the planner would have led on by is
 * the last thing tried, so a way that finds no room for its next passage ends as before. Side ways
 * off the passage stay as they are. Its draws come from `rng`, a stream of the passage's own.
 */
export function chainedBranches(rng: Rng, room: WorkRoom, flip: boolean, groups: readonly Branch[][], route: readonly number[], rules: ExitRules): Branch[][] {
  const [next, ...rest] = nextPassages(rng, room, flip, route, rules);
  // A string or a burrow leads on by one branch with the others held back; any other passage by its branch straight on.
  const one = groups.length === 1 && groups[0]!.length === 1 && groups[0]![0]!.fallbacks.length > 0;
  const at = groups.findIndex((group) => group.length === 1 && (one || ahead(room, group[0]!)));
  if (at < 0) return [...groups, [{ ...next!, fallbacks: rest }]];
  const plain = groups[at]![0]!;
  const lead: Branch = { ...next!, fallbacks: [...rest, { ...plain, fallbacks: [] }, ...plain.fallbacks] };
  return groups.map((group, k) => (k === at ? [lead] : group));
}
