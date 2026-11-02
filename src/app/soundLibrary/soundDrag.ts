import type { SoundKind } from '../sound/soundTypes';
import { isRecord } from '../utils/guards';
import { safeRelative } from './soundPaths';
import type { LibraryFile } from './SoundLibrary';

/** The type of a drag of library rows. A drag names only its types until it is dropped: `carriesSounds` is what a drop target asks while the pointer is over it. */
export const SOUND_DRAG_TYPE = 'application/x-atlas-sound-rows';

/** What a drag of library rows carries: `fileToMix` (`soundDirector/libraryDesk.ts`) and a tag of the rail take it from there. */
export interface SoundDrag {
  files: LibraryFile[];
}

export const carriesSounds = (transfer: Pick<DataTransfer, 'types'>): boolean => Array.from(transfer.types).includes(SOUND_DRAG_TYPE);

export function writeSoundDrag(transfer: Pick<DataTransfer, 'setData' | 'effectAllowed'>, drag: SoundDrag): void {
  transfer.setData(SOUND_DRAG_TYPE, JSON.stringify(drag));
  transfer.effectAllowed = 'copyMove';
}

const isKind = (value: unknown): value is SoundKind => value === 'music' || value === 'ambience';

/** Another window or plugin may have written it: what cannot be read is left out. */
export function readSoundDrag(transfer: Pick<DataTransfer, 'getData'>): SoundDrag | null {
  let data: unknown;
  try {
    data = JSON.parse(transfer.getData(SOUND_DRAG_TYPE));
  } catch {
    return null;
  }
  if (!isRecord(data) || !Array.isArray(data.files)) return null;
  const files = data.files.flatMap((file: unknown): LibraryFile[] => {
    if (!isRecord(file) || !isKind(file.kind) || typeof file.path !== 'string' || safeRelative(file.path) === null || typeof file.name !== 'string' || typeof file.size !== 'number' || typeof file.mtime !== 'number') return [];
    return [{ kind: file.kind, path: file.path, name: file.name, size: file.size, mtime: file.mtime }];
  });
  return { files };
}
