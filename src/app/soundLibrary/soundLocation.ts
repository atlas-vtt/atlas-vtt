/** A file below a root, with what browsing needs to know of it. */
export interface SoundFileEntry {
  name: string;
  /** Below the root, in `/`-form. */
  path: string;
  size: number;
  mtime: number;
}

export interface SoundFolderEntry {
  name: string;
  path: string;
}

/** What one folder holds, each list in the order the GM reads it. */
export interface SoundListing {
  folders: readonly SoundFolderEntry[];
  files: readonly SoundFileEntry[];
}

/**
 * A linked folder, wherever it lies: the vault or the disk. Every path is below the root in `/`-form,
 * and a path that could leave the root is refused with `SoundPathError`.
 */
export interface SoundLocation {
  /** Null where the folder is not there (the root's disk unplugged, the folder gone). */
  list(folder: string): Promise<SoundListing | null>;
  /**
   * The first thing at any depth below a folder that `list` does not show: another kind of file, something
   * hidden, a link. What is copied by going through `list` leaves that behind. Null where it shows everything.
   */
  firstUnlisted(folder: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<Blob>;
  /** A URL a media element can load; null where there is none. */
  resourceUrl(path: string): string | null;
  makeFolder(path: string): Promise<void>;
  /** Renames or moves a file or folder within the root. Refused where something lies at `to`. */
  move(from: string, to: string): Promise<void>;
  /** Writes a new file. Refused where something lies at `path`. */
  write(path: string, content: Blob): Promise<void>;
  /** Moves a file or folder to the system's trash. Refused with `TrashUnavailableError` where there is none. */
  trash(path: string): Promise<void>;
  /** Calls back with the path that changed, or null where anything may have. Returns the release. */
  watch(onChange: (path: string | null) => void): () => void;
}

/** A path that would leave its root. */
export class SoundPathError extends Error {
  constructor(path: string) {
    super(`${path} is not inside the linked folder.`);
    this.name = 'SoundPathError';
  }
}

/** A path that is Atlas' own, which no operation of the library may change. */
export class SoundPathReservedError extends Error {
  constructor(path: string) {
    super(`${path} is Atlas' own folder.`);
    this.name = 'SoundPathReservedError';
  }
}

/** Something already lies where a file was to go. */
export class SoundPathTakenError extends Error {
  constructor(path: string) {
    super(`${path} already exists.`);
    this.name = 'SoundPathTakenError';
  }
}

/** A folder holds what a copy to the other root would leave behind, so it stays where it is. */
export class SoundMoveRefusedError extends Error {
  constructor(readonly folder: string) {
    super(`${folder} holds what a copy would leave behind.`);
    this.name = 'SoundMoveRefusedError';
  }
}

/** This Obsidian offers no system trash, and Atlas deletes nothing for good. */
export class TrashUnavailableError extends Error {
  constructor() {
    super('The system trash is not available.');
    this.name = 'TrashUnavailableError';
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** A listing in reading order: `Track 2` before `Track 10`. */
export function sortedListing(folders: SoundFolderEntry[], files: SoundFileEntry[]): SoundListing {
  return {
    folders: folders.sort((a, b) => collator.compare(a.name, b.name)),
    files: files.sort((a, b) => collator.compare(a.name, b.name)),
  };
}
