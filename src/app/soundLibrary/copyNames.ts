import { joinRelative, nameOfRelative, parentOfRelative, stemOf } from './soundPaths';

/** How many numbered copies of one name are looked at for the copy of a kept original. */
const MAX_TWINS = 10;

const PART_SUFFIX = '.atlas-part';

/** Where a copy is written before it is whole: a name the library never lists, beside its source. */
export const partOf = (path: string): string => `${path}${PART_SUFFIX}`;

/** Whether a path is a part: a file Atlas was writing, which never was anyone's. */
export const isPart = (path: string): boolean => path.endsWith(PART_SUFFIX) && path.length > PART_SUFFIX.length;

/** The name a source's copy takes: its own, as an Opus file, in its own folder. */
export const stemCopyOf = (path: string): string => joinRelative(parentOfRelative(path), `${stemOf(nameOfRelative(path))}.opus`);

/** Where the copy of a kept original may lie: its Opus name, then the numbered names a taken one gives, while they exist. */
export async function twinsOf(path: string, exists: (candidate: string) => Promise<boolean>): Promise<string[]> {
  const stem = stemCopyOf(path);
  const base = stem.slice(0, -'.opus'.length);
  const twins: string[] = [];
  for (let number = 1; number <= MAX_TWINS; number++) {
    const candidate = number === 1 ? stem : `${base} ${number}.opus`;
    if (candidate === path) continue;
    if (!(await exists(candidate))) break;
    twins.push(candidate);
  }
  return twins;
}

/** Orders the copies of one source as every device keeps them: the one `named` after the source first, then the lowest path. */
export function keptFirst(named: string): (a: string, b: string) => number {
  return (a, b) => {
    if (a === named) return -1;
    if (b === named) return 1;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  };
}
