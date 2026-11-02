import type React from 'react';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { carriesSounds, readSoundDrag } from '../../../../../soundLibrary/soundDrag';
import { mayCarryAudio } from '../../../../../soundLibrary/soundFiles';
import type { LibraryActions } from './useLibraryActions';

/** Whether a folder takes what is being dragged: rows of the library, or files from outside. */
export const folderTakes = (event: React.DragEvent): boolean => carriesSounds(event.dataTransfer) || mayCarryAudio(event.dataTransfer);

/** A drop on a folder: rows move there, files from outside are imported there. */
export function dropOnFolder(actions: LibraryActions, event: React.DragEvent, kind: SoundKind, folder: string): void {
  event.preventDefault();
  event.stopPropagation();
  const drag = carriesSounds(event.dataTransfer) ? readSoundDrag(event.dataTransfer) : null;
  if (drag) actions.move([...drag.files.map((file) => ({ kind: file.kind, path: file.path, isFolder: false })), ...drag.folders.map((one) => ({ ...one, isFolder: true }))], kind, folder);
  else if (event.dataTransfer.files.length > 0) actions.importInto([...event.dataTransfer.files], kind, folder);
}
