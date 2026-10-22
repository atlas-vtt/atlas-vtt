import type { ShownEntry } from './LogState.ts';

/** Someone who answered in a thread, as its pill shows them. */
export interface Replier {
  readonly who: string;
  readonly name: string;
}

/** What a thread's pill says: how many answers the viewer holds, and the first three who gave them. */
export interface ThreadStat {
  readonly count: number;
  readonly repliers: readonly Replier[];
}

/** The most faces a thread's pill shows. */
export const PILL_FACES = 3;

/** Whether an entry has a row a thread can be opened from: a chat message, a roll, an image, a loot card, a found note or a rest. */
export function isThreadable(entry: ShownEntry): boolean {
  return entry.kind === 'chat' || entry.kind === 'roll' || entry.kind === 'image' || entry.kind === 'loot' || entry.kind === 'found' || entry.kind === 'rest';
}

const parentId = (entry: ShownEntry): string | undefined => (entry.kind === 'chat' && entry.reply?.gone !== true ? entry.reply?.id : undefined);

/**
 * Every threadable entry's thread, by the id of its root: the topmost ancestor the viewer holds. A
 * reply to an entry the viewer does not hold (a whisper to others, a roll they are not shown, one cut
 * from the log or deleted) is the root of its own thread, so a thread is made only of what the viewer sees.
 */
export function threadRoots(entries: readonly ShownEntry[]): ReadonlyMap<string, string> {
  const byId = new Map(entries.filter(isThreadable).map((entry) => [entry.id, entry]));
  const roots = new Map<string, string>();
  const rootOf = (start: ShownEntry): string => {
    const path: string[] = [];
    let entry = start;
    let root = roots.get(entry.id);
    while (root === undefined) {
      path.push(entry.id);
      const parent = byId.get(parentId(entry) ?? '');
      // A chain that comes back to itself ends where it turned.
      if (parent === undefined || path.includes(parent.id)) root = entry.id;
      else {
        entry = parent;
        root = roots.get(entry.id);
      }
    }
    for (const id of path) roots.set(id, root);
    return root;
  };
  for (const entry of byId.values()) rootOf(entry);
  return roots;
}

/** The root of the thread `id` is in; null where the viewer holds no threadable entry of that id. */
export function threadRoot(entries: readonly ShownEntry[], id: string): string | null {
  return threadRoots(entries).get(id) ?? null;
}

/** Every entry of the thread `id` is in, in the log's order, its root first; none where the viewer holds no such entry. */
export function threadOf(entries: readonly ShownEntry[], id: string): readonly ShownEntry[] {
  const roots = threadRoots(entries);
  const root = roots.get(id);
  return root === undefined ? [] : entries.filter((entry) => roots.get(entry.id) === root);
}

/** The pill of every thread with answers, by its root's id; answers count only where the viewer holds them. */
export function threadStats(entries: readonly ShownEntry[]): ReadonlyMap<string, ThreadStat> {
  const roots = threadRoots(entries);
  const stats = new Map<string, { count: number; repliers: Replier[] }>();
  for (const entry of entries) {
    const root = roots.get(entry.id);
    if (root === undefined || root === entry.id) continue;
    const stat = stats.get(root) ?? { count: 0, repliers: [] };
    stat.count += 1;
    if (stat.repliers.length < PILL_FACES && !stat.repliers.some((replier) => replier.who === entry.who)) stat.repliers.push({ who: entry.who, name: entry.name });
    stats.set(root, stat);
  }
  return stats;
}

/** "1 reply", "3 replies". */
export function repliesLabel(count: number): string {
  return count === 1 ? '1 reply' : `${count} replies`;
}
