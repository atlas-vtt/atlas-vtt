import { resolveSubpath, stripHeading, type CachedMetadata, type HeadingCache } from 'obsidian';

/** A heading and the sections around it, outermost first, as an outline nests them. */
export interface HeadingOutlineEntry {
  readonly heading: HeadingCache;
  readonly trail: readonly HeadingCache[];
}

export function headingOutline(headings: readonly HeadingCache[]): HeadingOutlineEntry[] {
  const open: HeadingCache[] = [];
  return headings.map((heading) => {
    while ((open.at(-1)?.level ?? 0) >= heading.level) open.pop();
    const trail = [...open];
    open.push(heading);
    return { heading, trail };
  });
}

/** A heading or link part as Obsidian compares them: stripped and in any case. */
function linkName(text: string): string {
  return stripHeading(text).toLowerCase();
}

/** The headings a link cannot tell from `heading` by its text; in note order. */
function sameInLinks(headings: readonly HeadingCache[], heading: HeadingCache): HeadingCache[] {
  const name = linkName(heading.heading);
  return headings.filter((other) => linkName(other.heading) === name);
}

/** Where Obsidian's reading of a link path lands. */
function walked(cache: CachedMetadata, path: string): HeadingCache | undefined {
  const found = resolveSubpath(cache, `#${path}`);
  return found?.type === 'heading' ? found.current : undefined;
}

/** Whether `trail` holds a section of each name, the later ones inside the earlier. */
function holdsInOrder(trail: readonly HeadingCache[], names: readonly string[]): boolean {
  let found = 0;
  for (const section of trail) if (linkName(section.heading) === names[found]) found++;
  return found === names.length;
}

/** The headings a link path can name, in note order: of its last part's name, inside a section of each part before it. */
function headingsOnPath(cache: CachedMetadata, path: string): HeadingCache[] {
  const names = path.split('#').filter(Boolean).map(linkName);
  const name = names.pop();
  return headingOutline(cache.headings ?? [])
    .filter(({ heading, trail }) => linkName(heading.heading) === name && holdsInOrder(trail, names))
    .map(({ heading }) => heading);
}

/**
 * The cached heading a pin's stored heading names. In order: a heading of exactly
 * that text (pins store a heading as the cache does, and "Room #3" holds a `#`);
 * else Obsidian's reading of the link (`Keep#Cellar`), which takes every `#` as a
 * heading deeper than the last and passes over empty parts. Each `#` at the end
 * counts one further heading of that path, for repeats no path tells apart. What
 * lands outside the sections the path names, or counts past the last of its
 * headings, names nothing: the heading is gone, and players must not be sent
 * another section in its place.
 */
export function headingNamed(cache: CachedMetadata, link: string): HeadingCache | undefined {
  const exact = cache.headings?.find((heading) => heading.heading === link);
  if (exact) return exact;
  const path = link.replace(/#+$/, '');
  const first = walked(cache, path);
  if (!first) return undefined;
  const onPath = headingsOnPath(cache, path);
  const start = onPath.indexOf(first);
  return start < 0 ? undefined : onPath[start + link.length - path.length];
}

/**
 * What a pin stores to name `target`. A heading only one of its name stays as the
 * cache holds it. A repeated one is named as Obsidian links to it, by the fewest
 * sections around it that find it (`Inn#Overview`), so edits elsewhere in the note
 * leave it alone, and Obsidian and older Atlas versions read it too. Repeats within
 * one section take a `#` per heading to pass, which those readers ignore: they open
 * the first, as they always did.
 */
export function headingLink(cache: CachedMetadata, target: HeadingCache): string {
  const headings = cache.headings ?? [];
  const same = sameInLinks(headings, target);
  const name = stripHeading(target.heading);
  if (same.length === 1 || name === '') return target.heading;

  const trail = (headingOutline(headings).find((entry) => entry.heading === target)?.trail ?? [])
    .map((section) => stripHeading(section.heading))
    .filter((section) => section !== '');
  const paths = trail.map((_, index) => [...trail.slice(trail.length - 1 - index), name].join('#'));

  const named = [...paths, target.heading].find((link) => headingNamed(cache, link) === target);
  if (named !== undefined) return named;
  for (const path of [...paths, name]) {
    const first = walked(cache, path);
    if (!first) continue;
    const onPath = headingsOnPath(cache, path);
    const count = onPath.indexOf(target) - onPath.indexOf(first);
    if (count < 0) continue;
    const counted = path + '#'.repeat(count);
    if (headingNamed(cache, counted) === target) return counted;
  }
  return target.heading;
}
