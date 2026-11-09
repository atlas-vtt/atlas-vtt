import { hasAtlasMark, readAtlasCopy, type AtlasCopyFacts, type FileRanges } from '../sound/codec/atlasOpus';
import { SoundImportError } from '../sound/codec/demux/demuxTypes';
import type { SoundKind, SoundRecord } from '../sound/soundTypes';
import type { CopyFolder, FolderCopy, SourceStat } from '../soundDirector/copyFolder';
import type { SoundLibrary } from './SoundLibrary';
import type { SoundLocation } from './soundLocation';
import { freeName, isExternalAudioPath, nameOfRelative, parentOfRelative } from './soundPaths';
import { soundAfterMove } from './soundRecords';
import type { SoundRecordStore } from './SoundRecordStore';
import type { OriginalsChoice } from './SoundRoots';
import { partOf, stemCopyOf, twinsOf } from './copyNames';

export type CopyLibrary = Pick<SoundLibrary, 'pathNow' | 'fileOfAudioPath' | 'locationOf' | 'audioPathOf' | 'rootOf' | 'roots'>;

export type CopyRecords = Pick<SoundRecordStore, 'whenLoaded' | 'rewrite'>;

interface Place {
  kind: SoundKind;
  path: string;
  location: SoundLocation;
}

/** Files read for what they say of themselves at once: a start asks of every file in the folders. */
const READING_AT_ONCE = 8;

const isOgg = (path: string): boolean => /\.(opus|ogg)$/i.test(path);

const sameStat = (a: SourceStat | null, b: SourceStat): boolean => a !== null && a.size === b.size && a.mtime === b.mtime;

/**
 * The copies in the GM's linked folders: `Tavern.mp3` becomes `Tavern.opus` beside it, and the original goes to
 * the trash only once the copy stands under its name, and only where the GM chose that, the folder has a
 * trash and the original is still what was converted. Every change goes through the root's location.
 */
export class LibraryCopyFolder implements CopyFolder {
  /** Where each key's copy was found this session, by root and path, so a second copy of one key is seen. */
  private readonly copiesOfKey = new Map<string, { kind: SoundKind; path: string }>();
  private reading = 0;
  private readonly waitingToRead: Array<() => void> = [];

  constructor(
    private readonly library: () => CopyLibrary | null,
    private readonly records: CopyRecords,
    private readonly now: () => number = Date.now,
  ) {}

  choiceFor(sound: SoundRecord): OriginalsChoice | null {
    const place = this.placeOf(sound.filePath, sound.audioSize);
    return place ? (this.library()?.roots.originalsOf(place.kind) ?? null) : null;
  }

  async factsOf(sound: SoundRecord): Promise<FolderCopy | null> {
    const place = this.placeOf(sound.filePath, sound.audioSize);
    if (!place) return null;
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

  async store(sound: SoundRecord, copy: Blob, choice: OriginalsChoice, sourceStat: SourceStat): Promise<string> {
    const place = this.placeOf(sound.filePath, sound.audioSize);
    const library = this.library();
    const sourceAudio = place && library?.audioPathOf(place.kind, place.path);
    if (!place || !library || !sourceAudio) throw new SoundImportError('cannot-write', `${sound.filePath} is not in a linked folder on this device.`);
    const { location, path } = place;
    const facts = await readAtlasCopy(copy);
    if (!facts) throw new SoundImportError('verify-failed', 'The copy does not say what it is.');
    const part = partOf(path);
    await writing(`write ${part}`, async () => {
      if (await location.exists(part)) await location.trash(part);
      await location.write(part, copy);
    });
    const stem = stemCopyOf(path);
    let final: string;
    if (stem !== path && (await this.copyAt(place, stem, false))?.key === facts.key) {
      await location.trash(part).catch((error: unknown) => console.error(`[Atlas] Could not take away ${part}`, error));
      final = stem;
    } else {
      final = await freeName(stem, (candidate) => location.exists(candidate));
      await writing(`move ${part} to ${final}`, () => location.move(part, final), () => location.trash(part));
    }
    final = await this.dealWithSource(place, final, choice, sourceStat);
    const copyAudio = library.audioPathOf(place.kind, final) ?? sourceAudio;
    await this.follow(sourceAudio, copyAudio, copy.size);
    this.copiesOfKey.set(facts.key, { kind: place.kind, path: final });
    return copyAudio;
  }

  async blob(audioPath: string): Promise<Blob> {
    const place = this.placeOf(audioPath);
    if (!place) throw new Error(`${audioPath} is not reachable on this device.`);
    return place.location.read(place.path);
  }

  /** The original to the trash where chosen and still what was converted; then the copy takes its name where it was an Opus file. */
  private async dealWithSource({ location, path }: Place, final: string, choice: OriginalsChoice, sourceStat: SourceStat): Promise<string> {
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
      return path;
    } catch (error) {
      console.error(`[Atlas] Could not name ${final} as ${path}`, error);
      return final;
    }
  }

  private async follow(from: string, to: string, size: number): Promise<void> {
    if (from === to) return;
    await this.records.whenLoaded();
    const now = this.now();
    this.records.rewrite((stored) => {
      const moved = soundAfterMove(stored, from, to, now);
      return moved && moved.audioPath === to ? { ...moved, audioSize: size } : moved;
    });
  }

  /**
   * The copy found for a key. Where a race between devices left two copies of one key in one folder, every device
   * keeps the lower path and trashes the other, as library records are decided; records follow to the one kept.
   */
  private async noted(place: Place, path: string, facts: AtlasCopyFacts): Promise<FolderCopy | null> {
    const library = this.library();
    const held = this.copiesOfKey.get(facts.key);
    let kept = path;
    if (held && held.kind === place.kind && held.path !== path && parentOfRelative(held.path) === parentOfRelative(path) && (await place.location.exists(held.path))) {
      kept = held.path < path ? held.path : path;
      const loser = kept === path ? held.path : path;
      if (place.location.canTrash()) {
        await place.location.trash(loser);
        const from = library?.audioPathOf(place.kind, loser);
        const to = library?.audioPathOf(place.kind, kept);
        if (from && to) await this.follow(from, to, (await place.location.stat(kept))?.size ?? 0);
      } else kept = path;
    }
    this.copiesOfKey.set(facts.key, { kind: place.kind, path: kept });
    const audioPath = library?.audioPathOf(place.kind, kept);
    return audioPath ? { facts: kept === path ? facts : (await this.copyAt(place, kept, false)) ?? facts, audioPath } : null;
  }

  /** What a file says of itself, from its first pages and its last; a file marked by Atlas whose facts do not read is refused where `refuse`. */
  private async copyAt(place: Place, path: string, refuse: boolean): Promise<AtlasCopyFacts | null> {
    await this.turnToRead();
    try {
      const stat = await place.location.stat(path);
      if (!stat) return null;
      const ranges: FileRanges = { size: stat.size, read: (start, end) => place.location.readRange(path, start, end) };
      const facts = await readAtlasCopy(ranges);
      if (!facts && refuse && (await hasAtlasMark(ranges))) throw new SoundImportError('unreadable', `${path} was made by Atlas and its facts do not read.`);
      return facts;
    } catch (error) {
      if (error instanceof SoundImportError) throw error;
      console.error(`[Atlas] Could not read ${path}`, error);
      return null;
    } finally {
      this.doneReading();
    }
  }

  private turnToRead(): Promise<void> {
    if (this.reading < READING_AT_ONCE) {
      this.reading++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waitingToRead.push(resolve));
  }

  private doneReading(): void {
    const next = this.waitingToRead.shift();
    if (next) next();
    else this.reading--;
  }

  /** A record's file on this device, in a linked root: an external path only in a root on disk. */
  private placeOf(audioPath: string, audioSize?: number): Place | null {
    const library = this.library();
    if (!library) return null;
    const now = library.pathNow(audioPath, audioSize);
    const file = library.fileOfAudioPath(now);
    if (!file || (isExternalAudioPath(now) && library.rootOf(file.kind).status !== 'external')) return null;
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
