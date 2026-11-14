/**
 * Groups of drawings and texts: annotations with one `group` select, move, turn, scale, copy and
 * delete as one (`withGroups`). Grouping gives what is selected one new group, merging the groups
 * it held; ungrouping takes its group off. A locked annotation is left as it is by both.
 */

import { isLocked } from './annotationLock';

/** What a grouping reads of an annotation: one as the store keeps it, or as it is read (`Annotation`). */
interface Grouped {
  readonly group?: unknown;
  readonly locked?: unknown;
}

const groupOf = (entry: Grouped): string | null => (typeof entry.group === 'string' && entry.group !== '' ? entry.group : null);

/** Those of `selected` a grouping changes: the ones that are not locked. */
function free<Entry extends Grouped>(selected: readonly Entry[]): Entry[] {
  return selected.filter((entry) => !isLocked(entry));
}

/** Whether Group changes `selected`: two or more of them are not locked, and they are not one group already. */
export function groupable(selected: readonly Grouped[]): boolean {
  const members = free(selected);
  if (members.length < 2) return false;
  const group = groupOf(members[0]!);
  return group === null || members.some((member) => groupOf(member) !== group);
}

/** Whether Ungroup changes `selected`: one of them that is not locked is in a group. */
export function ungroupable(selected: readonly Grouped[]): boolean {
  return free(selected).some((member) => groupOf(member) !== null);
}
