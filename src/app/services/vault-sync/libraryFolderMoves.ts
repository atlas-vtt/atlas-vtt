import { ATLAS_VTT_DIR } from '../assetPaths';
import { movedFolderPathOf } from '../renamedPaths';

/**
 * Tells the renames by which the library's folder leaves its place from every
 * other rename. Obsidian reports a renamed folder first and then, before any
 * other rename, everything that lies in it.
 */
export class LibraryFolderMoves {
  /** Where the folder went, while what lies in it is still being reported. */
  private leavingFor: string | null = null;

  /** Whether the rename is the library's folder leaving, or the report of something that left in it. */
  isLeaving(from: string, to: string): boolean {
    if (from === ATLAS_VTT_DIR) {
      this.leavingFor = to;
    } else if (this.leavingFor !== null && movedFolderPathOf([{ from: ATLAS_VTT_DIR, to: this.leavingFor }])(from) !== to) {
      this.leavingFor = null;
    }
    return this.leavingFor !== null;
  }
}
