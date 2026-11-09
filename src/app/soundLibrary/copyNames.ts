import { joinRelative, nameOfRelative, parentOfRelative, stemOf } from './soundPaths';

/** How many numbered copies of one name are looked at for the copy of a kept original. */
const MAX_TWINS = 10;

/** Where a copy is written before it is whole: a name the library never lists, beside its source. */
export const partOf = (path: string): string => `${path}.atlas-part`;

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
