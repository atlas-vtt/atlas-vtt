import { readAtlasCopy, type AtlasCopyFacts } from '../sound/codec/atlasOpus';
import { SoundImportError } from '../sound/codec/demux/demuxTypes';
import type { SoundKind, SoundRecord } from '../sound/soundTypes';
import type { CopyFolder, FolderCopy, SourceStat } from '../soundDirector/copyFolder';
import { keptFirst, partOf, stemCopyOf, twinsOf } from './copyNames';
import { CopyReader, FACTS_STUCK_MS } from './copyReader';
import type { SoundLibrary } from './SoundLibrary';
import type { SoundLocation } from './soundLocation';
import { freeName, isExternalAudioPath, joinRelative, nameOfRelative, parentOfRelative } from './soundPaths';
import { soundAfterMove } from './soundRecords';
import type { SoundRecordStore } from './SoundRecordStore';
import type { OriginalsChoice } from './SoundRoots';

export type CopyLibrary = Pick<SoundLibrary, 'pathNow' | 'fileOfAudioPath' | 'locationOf' | 'audioPathOf' | 'rootOf' | 'roots' | 'copies'>;

export type CopyRecords = Pick<SoundRecordStore, 'whenLoaded' | 'rewrite'>;

interface Place {
  kind: SoundKind;
  path: string;
  location: SoundLocation;
}

const isOgg = (path: string): boolean => /\.(opus|ogg)$/i.test(path);

const readKey = (sound: SoundRecord): string => `${sound.id}\n${sound.filePath}`;

const sameStat = (a: SourceStat | null, b: SourceStat): boolean => a !== null && a.size === b.size && a.mtime === b.mtime;

/** One copy of one source: two sources with the same bytes under two names are two sounds the GM keeps. */
const copyId = (facts: AtlasCopyFacts): string => `${facts.key}\n${facts.from}`;

/**
 * The copies in the GM's linked folders: `Tavern.mp3` becomes `Tavern.opus` beside it, and the original goes to
 * the trash only once the copy stands whole under its name, and only where the GM chose that, the folder has a
 * trash and the original is still what was converted. Every change goes through the root's location.
 */
export class LibraryCopyFolder implements CopyFolder {
  /** Where each copy was found this session, so a second copy of one source in its folder is seen. */
  private readonly found = new Map<string, { kind: SoundKind; path: string }>();
  private readonly reader: CopyReader;

  constructor(
    private readonly library: () => CopyLibrary | null,
    private readonly records: CopyRecords,
    private readonly now: () => number = Date.now,
    stuckMs = FACTS_STUCK_MS,
  ) {
    this.reader = new CopyReader(stuckMs);
  }

  choiceFor(sound: SoundRecord): OriginalsChoice | null {
    const place = this.placeOf(sound.filePath, sound.audioSize);
    const library = this.library();
    if (place === 'outside' || !place || !library) return null;
    // A source whose own copy stands beside it is never converted again: it plays from the copy once that reads.
    return library.copies.copyOf(place.kind, place.path) === null ? library.roots.originalsOf(place.kind) : null;
  }

  outside(sound: SoundRecord): boolean {
    return this.placeOf(sound.filePath, sound.audioSize) === 'outside';
  }

  factsOf(sound: SoundRecord): Promise<FolderCopy | null | 'unknown'> {
    const place = this.placeOf(sound.filePath, sound.audioSize);
    if (!place || place === 'outside') return Promise.resolve(null);
    return this.reader.within(readKey(sound), () => this.readFacts(place));
  }

  hurry(sound: SoundRecord): void {
    this.reader.hurry(readKey(sound));
  }

  private async readFacts(place: Place): Promise<FolderCopy | null> {
    if (isOgg(place.path)) {
      const facts = await this.copyAt(place, place.path, true);
      if (facts) return this.noted(place, place.path, facts);
    }
    for (const twin of await twinsOf(place.path, (path) => place.location.exists(path))) {
      const facts = await this.copyAt(place, twin, false);
      if (facts?.from === nameOfRelative(place.path)) return this.noted(place, twin, facts);
    }
    return null;
  }

  /** What a file in the folder says of itself; the library learns of every copy read, so a source beside its own is not listed. */
  private async copyAt({ kind, location }: Place, path: string, refuse: boolean): Promise<AtlasCopyFacts | null> {
    const copy = await this.reader.copyAt(location, path, refuse);
    if (copy) this.library()?.copies.note(kind, path, copy.facts.from, copy.size);
    return copy?.facts ?? null;
  }

  async store(sound: SoundRecord, copy: Blob, choice: OriginalsChoice, sourceStat: SourceStat): Promise<string> {
    const place = this.placeOf(sound.filePath, sound.audioSize);
    const library = this.library();
    const sourceAudio = place && place !== 'outside' ? library?.audioPathOf(place.kind, place.path) : null;
    if (!place || place === 'outside' || !library || !sourceAudio) throw new SoundImportError('cannot-write', `${sound.filePath} is not in a linked folder on this device.`);
    const facts = await readAtlasCopy(copy);
    if (!facts) throw new SoundImportError('verify-failed', 'The copy does not say what it is.');
    let final = await this.placeCopy(place, copy, facts);
    final = await this.dealWithSource(place, final, choice, sourceStat, facts, copy.size);
    library.copies.note(place.kind, final, facts.from, (await place.location.stat(final))?.size ?? copy.size);
    const copyAudio = library.audioPathOf(place.kind, final) ?? sourceAudio;
    await this.follow(sourceAudio, copyAudio, copy.size);
    this.found.set(copyId(facts), { kind: place.kind, path: final });
    return copyAudio;
  }

  async blob(audioPath: string): Promise<Blob> {
    const place = this.placeOf(audioPath);
    if (!place || place === 'outside') throw new Error(`${audioPath} is not reachable on this device.`);
    return place.location.read(place.path);
  }

  /** Writes the copy beside its source and gives it its name, unless another device's copy of it stands there. Checks it whole on disk. */
  private async placeCopy({ location, path }: Place, copy: Blob, facts: AtlasCopyFacts): Promise<string> {
    const part = partOf(path);
    await writing(`write ${part}`, async () => {
      if (!(await location.exists(part))) await location.write(part, copy);
      else if (location.canTrash()) {
        await location.trash(part);
        await location.write(part, copy);
      } else await location.replace(part, copy);
    });
    const stem = stemCopyOf(path);
    const there = stem === path ? null : await this.reader.factsAt(location, stem, false);
    if (there && copyId(there) === copyId(facts)) {
      await location.trash(part).catch((error: unknown) => console.error(`[Atlas] Could not take away ${part}`, error));
      return stem;
    }
    const final = await freeName(stem, (candidate) => location.exists(candidate));
    await writing(`move ${part} to ${final}`, () => location.move(part, final), () => location.trash(part));
    if (!(await this.reader.stands(location, final, facts.key, copy.size))) {
      await location.trash(final).catch(() => undefined);
      throw new SoundImportError('verify-failed', `${final} is not whole on disk.`);
    }
    return final;
  }

  /** The original to the trash where chosen and still what was converted; then the copy takes its name where it was an Opus file. */
  private async dealWithSource({ location, path }: Place, final: string, choice: OriginalsChoice, sourceStat: SourceStat, facts: AtlasCopyFacts, size: number): Promise<string> {
    if (choice !== 'trash' || !location.canTrash() || !sameStat(await location.stat(path), sourceStat)) return final;
    try {
      await location.trash(path);
    } catch (error) {
      console.error(`[Atlas] Could not move ${path} to the trash`, error);
      return final;
    }
    if (path !== stemCopyOf(path) || final === path) return final;
    try {
      await location.move(final, path);
    } catch (error) {
      console.error(`[Atlas] Could not name ${final} as ${path}`, error);
      return final;
    }
    if (!(await this.reader.stands(location, path, facts.key, size))) throw new SoundImportError('verify-failed', `${path} is not whole on disk.`);
    return path;
  }

  /** Records of the source name its copy, and its size. */
  private async follow(from: string, to: string, size: number): Promise<void> {
    await this.records.whenLoaded();
    const now = this.now();
    this.records.rewrite((stored) => {
      const moved = soundAfterMove(stored, from, to, now);
      return moved && moved.audioPath === to ? { ...moved, audioSize: size } : moved;
    });
  }

  /**
   * The copy found for a source. Where a race between devices left two copies of one source in one folder, every
   * device keeps the one named after the source, else the lower path, and trashes the other; records follow.
   * Both are read again first: only two Atlas copies of one source, of the same name, are ever one too many.
   */
  private async noted(place: Place, path: string, facts: AtlasCopyFacts): Promise<FolderCopy | null> {
    const library = this.library();
    const id = copyId(facts);
    const held = this.found.get(id);
    let kept = path;
    if (held && held.kind === place.kind && held.path !== path && parentOfRelative(held.path) === parentOfRelative(path)) {
      kept = await this.oneOfTwo(place, held.path, path, facts);
    }
    this.found.set(id, { kind: place.kind, path: kept });
    const audioPath = library?.audioPathOf(place.kind, kept);
    if (!audioPath) return null;
    return { facts: kept === path ? facts : (await this.reader.factsAt(place.location, kept, false)) ?? facts, audioPath };
  }

  /** Which of two copies stays: the other goes to the trash where both still are copies of one source and the folder has a trash. */
  private async oneOfTwo({ kind, location }: Place, held: string, path: string, facts: AtlasCopyFacts): Promise<string> {
    const [heldFacts, pathFacts] = await Promise.all([this.reader.factsAt(location, held, false), this.reader.factsAt(location, path, false)]);
    const same = (other: AtlasCopyFacts | null): boolean => other !== null && copyId(other) === copyId(facts);
    if (!same(heldFacts) || !same(pathFacts) || !location.canTrash()) return path;
    const [kept = path] = [held, path].sort(keptFirst(stemCopyOf(joinRelative(parentOfRelative(path), facts.from))));
    const loser = kept === held ? path : held;
    await location.trash(loser);
    const library = this.library();
    const from = library?.audioPathOf(kind, loser);
    const to = library?.audioPathOf(kind, kept);
    if (from && to) await this.follow(from, to, (await location.stat(kept))?.size ?? 0);
    return kept;
  }

  /** A record's file on this device: in a linked root (an external path only in a root on disk), outside every root, or not reachable now. */
  private placeOf(audioPath: string, audioSize?: number): Place | 'outside' | null {
    const library = this.library();
    if (!library) return null;
    // The source's own name: a source beside its copy is converted and stored as itself, never as its copy.
    const now = library.pathNow(audioPath, audioSize, false);
    const file = library.fileOfAudioPath(now);
    if (!file) return isExternalAudioPath(now) ? null : 'outside';
    if (isExternalAudioPath(now) && library.rootOf(file.kind).status !== 'external') return null;
    const location = library.locationOf(file.kind);
    return location && { kind: file.kind, path: file.path, location };
  }
}

/** A write or move that fails is the folder refusing it: the sound is refused as such, after `undo`. */
async function writing(what: string, change: () => Promise<void>, undo?: () => Promise<void>): Promise<void> {
  try {
    await change();
  } catch (error) {
    await undo?.().catch(() => undefined);
    throw new SoundImportError('cannot-write', `Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
