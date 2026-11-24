import { readAtlasCopy } from '../../sound/codec/atlasOpus';
import { partOf } from '../../soundLibrary/copyNames';
import type { SoundLocation } from '../../soundLibrary/soundLocation';
import { freeName, joinRelative, nameOfRelative, parentOfRelative } from '../../soundLibrary/soundPaths';
import { sha256 } from '../../utils/hashing';
import { t } from '../../i18n';
import type { MusicImportPlan } from './musicImportPlan';

/**
 * Where a file of the version before waits while an update is written: beside its place, under a name the library
 * never lists (no audio, no sidecar), which no sound record follows. It goes back on failure, to the trash once the
 * update stands, or, for a track that is only renamed, to its new name.
 */
export const asideOf = (path: string): string => `${path}.atlas-old`;

type Undo = () => Promise<void>;

/** What became of the files of the version before that the install let go of. */
export interface LetGoFiles {
  /** Gone to the trash, by the path they had. */
  gone: string[];
  /** Not taken by the trash and back in the folder: where each is now, by the path it had. */
  putBack: Map<string, string>;
  /** Files an earlier install set aside and could not let go of, back in the folder now. */
  strays: string[];
}

/** The folders `folder` needs that are not there yet, the deepest first. */
async function missingFolders(location: SoundLocation, folder: string): Promise<string[]> {
  const missing: string[] = [];
  for (let at = folder; at !== '' && !(await location.exists(at)); at = parentOfRelative(at)) missing.push(at);
  return missing;
}

/** Writes a new file as a part beside its place and reads it back; a part a failed run left there is never anyone's and goes first. */
async function writePart(location: SoundLocation, path: string, bytes: Blob, undo: Undo[]): Promise<string> {
  const part = partOf(path);
  if (await location.exists(part)) await location.removePart(part);
  await location.write(part, bytes);
  undo.push(() => location.removePart(part));
  return part;
}

/** Moves a file and remembers how to move it back. */
async function moveUndoably(location: SoundLocation, from: string, to: string, undo: Undo[]): Promise<void> {
  await location.move(from, to);
  undo.push(() => location.move(to, from));
}

/**
 * Lets go of a file set aside: to the trash, and where the trash did not take it, back into the folder under a free
 * name beside its old place that no file of the install takes, so it is neither hidden for ever nor deleted for good.
 * Returns where it was put back; null where it is gone.
 */
async function letGo(location: SoundLocation, aside: string, original: string, taken: ReadonlySet<string>): Promise<string | null> {
  try {
    await location.trash(aside);
    return null;
  } catch (error) {
    if (!(await location.exists(aside))) return null;
    console.warn(`[Atlas] The trash did not take ${aside}, so it goes back into its folder:`, error);
  }
  const folder = parentOfRelative(original);
  const name = await freeName(nameOfRelative(original), async (candidate) => taken.has(joinRelative(folder, candidate)) || location.exists(joinRelative(folder, candidate)));
  const back = joinRelative(folder, name);
  await location.move(aside, back);
  return back;
}

/** Sets a file of the version before aside; an aside an earlier let-go left there is let go of first. */
async function setAside(location: SoundLocation, path: string, undo: Undo[], taken: ReadonlySet<string>, strays: string[]): Promise<string> {
  const aside = asideOf(path);
  if (await location.exists(aside)) {
    const back = await letGo(location, aside, path, taken);
    if (back !== null) {
      strays.push(back);
      undo.push(async () => {
        strays.splice(strays.indexOf(back), 1);
        await location.move(back, aside);
      });
    }
  }
  await moveUndoably(location, path, aside, undo);
  return aside;
}

/** Takes back every step done, the last first; a step that cannot be taken back is logged, and the others still are. */
async function rollBack(undo: readonly Undo[]): Promise<void> {
  for (const step of [...undo].reverse()) {
    await step().catch((error: unknown) => console.error('[Atlas] Could not take back a step of a music install:', error));
  }
}

/** Every path of the install and of the version before, whose aside an earlier install may have left. */
function pathsOf(plan: MusicImportPlan): string[] {
  const before = plan.installed ? [plan.installed.sidecarPath, ...plan.installed.sidecar.tracks.map(({ file }) => joinRelative(plan.installed?.folder ?? '', file))] : [];
  return [...new Set([...before, ...plan.tracks.map((track) => track.path), ...(plan.sidecarPath === null ? [] : [plan.sidecarPath])])];
}

/**
 * Writes what a planned install of music puts in the music root, so that it ends whole or as the folder was:
 * 1. every track that is written (and a sidecar at a new place) is written as a part and read back (SHA-256, `readAtlasCopy`);
 * 2. each file of the version before that a track replaces or that goes is set aside (`asideOf`), and so is each that
 *    only takes a new name;
 * 3. each part and each renamed file takes its place, and a sidecar in its old place is written over, last.
 * A track whose file stays as it is is not touched. Any failure takes back every step done, by moving and by removing
 * parts, never through the trash. Only once all of it stands do the files set aside go to the trash; the caller has
 * refused an install that sets any aside where the root has none, so nothing of the GM's is ever deleted for good, and
 * a file the trash does not take is put back in the folder rather than left hidden. So is an aside an earlier install
 * left of any file of this one.
 */
export async function installMusicFiles(location: SoundLocation, plan: MusicImportPlan, sidecar: Blob | null): Promise<LetGoFiles> {
  const undo: Undo[] = [];
  const asides: { aside: string; path: string }[] = [];
  const strays: string[] = [];
  const taken = new Set([...plan.tracks.map((track) => track.path), ...(plan.sidecarPath === null ? [] : [plan.sidecarPath])]);
  try {
    const made = await missingFolders(location, plan.folder);
    undo.push(async () => {
      for (const folder of made) if (await location.exists(folder)) await location.removeEmptyFolder(folder);
    });
    await location.makeFolder(plan.folder);
    const parts = new Map<string, string>();
    for (const track of plan.tracks.filter((each) => each.from === null)) {
      const part = await writePart(location, track.path, track.bytes, undo);
      const back = await location.read(part);
      if ((await sha256(await back.arrayBuffer())) !== track.sha256 || !(await readAtlasCopy(back))) throw new Error(t('armariumMusic.verifyFailed', { title: track.title }));
      parts.set(track.path, part);
    }
    const sidecarPath = plan.sidecarPath;
    const sidecarInPlace = sidecarPath !== null && plan.installed?.sidecarPath === sidecarPath;
    if (sidecar && sidecarPath !== null && !sidecarInPlace) parts.set(sidecarPath, await writePart(location, sidecarPath, sidecar, undo));
    for (const path of [...plan.tracks.filter((track) => track.replaces).map((track) => track.path), ...plan.removes]) asides.push({ aside: await setAside(location, path, undo, taken, strays), path });
    const renamed: { aside: string; path: string }[] = [];
    for (const track of plan.tracks) {
      if (track.from !== null && track.from !== track.path) renamed.push({ aside: await setAside(location, track.from, undo, taken, strays), path: track.path });
    }
    for (const [path, part] of parts) await moveUndoably(location, part, path, undo);
    for (const { aside, path } of renamed) await moveUndoably(location, aside, path, undo);
    if (sidecar && sidecarPath !== null && sidecarInPlace) {
      const before = await location.read(sidecarPath);
      undo.push(() => location.replace(sidecarPath, before));
      await location.replace(sidecarPath, sidecar);
    }
  } catch (error) {
    await rollBack(undo);
    throw error;
  }
  return letGoOf(location, plan, asides, taken, strays);
}

/** Lets go of what the install set aside, then of asides an earlier install left; nothing here undoes the install. */
async function letGoOf(location: SoundLocation, plan: MusicImportPlan, asides: readonly { aside: string; path: string }[], taken: ReadonlySet<string>, strays: string[]): Promise<LetGoFiles> {
  const done: LetGoFiles = { gone: [], putBack: new Map(), strays };
  const letGoSafely = async (aside: string, path: string): Promise<string | null | undefined> => letGo(location, aside, path, taken)
    .catch((error: unknown) => {
      console.error(`[Atlas] Could not let go of ${aside}:`, error);
      return undefined;
    });
  for (const { aside, path } of asides) {
    const back = await letGoSafely(aside, path);
    if (back === null) done.gone.push(path);
    else if (back !== undefined) done.putBack.set(path, back);
  }
  const handled = new Set(asides.map(({ path }) => path));
  for (const path of pathsOf(plan).filter((each) => !handled.has(each))) {
    if (!(await location.exists(asideOf(path)))) continue;
    const back = await letGoSafely(asideOf(path), path);
    if (back) strays.push(back);
  }
  return done;
}
