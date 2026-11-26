import type { SoundKind } from '../sound/soundTypes';
import type { RecordsSeam } from '../soundLibrary/libraryRecords';
import type { LibraryFile, SoundLibrary } from '../soundLibrary/SoundLibrary';
import type { OriginalsChoice } from '../soundLibrary/SoundRoots';
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
 * is asked for once, in the order the folder lists it, and the whole folder again once the GM gives its choice
 * (until then nothing in it is converted, only read for what it says of itself). The queue converts a few at
 * once in the background; a press still goes first. Runs while sound is switched on; switching it on looks at
 * everything again.
 */
export class LinkedFolderWatch {
  private seen = new Set<string>();
  /** Each root's choice at the last look: one given since asks for the whole folder again. */
  private choices: Partial<Record<SoundKind, OriginalsChoice | null>> = {};
  private timer = 0;
  private wasOn = false;
  private readonly stops: Array<() => void>;

  constructor(private readonly deps: LinkedFolderDeps) {
    this.stops = [
      deps.library.onChange(() => this.schedule()),
      deps.library.roots.onChange(() => this.schedule()),
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
      this.choices = {};
      return;
    }
    const listed = new Set<string>();
    const asked: LibraryFile[] = [];
    for (const kind of KINDS) {
      const choice = library.roots.originalsOf(kind);
      // What was looked at while the folder had no choice was not converted then, and may be now.
      const agreedNow = choice !== null && choice !== this.choices[kind];
      this.choices[kind] = choice;
      for (const { entry } of library.filesOf(kind)) {
        const key = `${kind}:${entry.path}`;
        listed.add(key);
        if (agreedNow || !this.seen.has(key)) asked.push({ ...entry, kind });
      }
    }
    // What left the listing is forgotten, so a folder linked again, or a file put back, is looked at again.
    this.seen = listed;
    if (asked.length === 0) return;
    runInBackground(requestCopies(this.deps, asked), 'Preparing the sounds of a linked folder');
  }
}
