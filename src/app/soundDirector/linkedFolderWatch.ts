import type { SoundKind } from '../sound/soundTypes';
import type { RecordsSeam } from '../soundLibrary/libraryRecords';
import type { LibraryFile, SoundLibrary } from '../soundLibrary/SoundLibrary';
import { MOOD_LIMITS } from '../soundLibrary/moodFile';
import { runInBackground } from '../utils/backgroundTask';
import { requestCopies } from './libraryDesk';
import type { SoundDirector } from './SoundDirector';

const KINDS: readonly SoundKind[] = ['music', 'ambience'];
/** A folder copied in arrives as many changes: they are taken together once it has gone quiet this long. */
export const SETTLE_MS = 1500;

export interface LinkedFolderDeps {
  records: RecordsSeam;
  library: SoundLibrary;
  director: SoundDirector;
}

/**
 * Makes copies of what the linked folders hold without being asked: everything in a folder the moment it is
 * linked, and every file that turns up in one later, from Atlas, the file manager or a sync tool. Each file
 * is asked for once, the first a list can hold of each arrival (the copies' cache would churn past that),
 * newest arrivals in the order the folder lists them. The queue makes a few at once in the background; a
 * press still goes first. Runs while sound is switched on; switching it on looks at everything again.
 */
export class LinkedFolderWatch {
  private seen = new Set<string>();
  private timer = 0;
  private wasOn = false;
  private readonly stops: Array<() => void>;

  constructor(private readonly deps: LinkedFolderDeps) {
    this.stops = [
      deps.library.onChange(() => this.schedule()),
      deps.director.subscribe(() => {
        if (deps.director.isOn !== this.wasOn) this.schedule();
      }),
    ];
    this.schedule();
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    for (const stop of this.stops) stop();
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.check(), SETTLE_MS);
  }

  private check(): void {
    const { director, library } = this.deps;
    this.wasOn = director.isOn;
    if (!director.isOn) {
      this.seen = new Set();
      return;
    }
    const listed = new Set<string>();
    const fresh: LibraryFile[] = [];
    for (const kind of KINDS) {
      for (const { entry } of library.filesOf(kind)) {
        const key = `${kind}:${entry.path}`;
        listed.add(key);
        if (!this.seen.has(key)) fresh.push({ ...entry, kind });
      }
    }
    // What left the listing is forgotten, so a folder linked again, or a file put back, is looked at again.
    this.seen = listed;
    if (fresh.length === 0) return;
    runInBackground(requestCopies(this.deps, fresh.slice(0, MOOD_LIMITS.tracks)), 'Preparing new sounds in a linked folder');
  }
}
