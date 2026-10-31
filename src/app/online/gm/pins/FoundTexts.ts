import { TFile, type App, type EventRef, type TAbstractFile } from 'obsidian';
import type { FoundNote } from '../../protocol/index.ts';
import { QuestImages } from '../../../plugin/questImages';
import type { FoundPin, GmLogEntry } from '../log/logEntries.ts';
import type { TableLog } from '../log/TableLog.ts';
import type { AssetStoring } from '../assets/assetUses.ts';
import { foundHandout, readPinNote, type FoundHandout, type NoteReading } from './foundNotes.ts';

type FoundEntry = Extract<GmLogEntry, { readonly kind: 'found' }>;

/** A found note as last handed on: where it was read, its link, and what its entry and assets hold. */
interface Kept {
  readonly path: string;
  readonly pin: FoundPin;
  readonly handout: FoundHandout;
}

/** A read of a found note: what players read of it now, and the assets that go with it. */
export interface FoundRead {
  readonly reading: NoteReading;
  readonly handout: FoundHandout;
}

const isFound = (entry: GmLogEntry): entry is FoundEntry => entry.kind === 'found';

/**
 * The notes players found, kept current: each found note's entry follows its note as the GM edits it
 * (the vault's metadata for the note, its images' files for what it embeds), its whole text and images
 * stored for players and named by id. Where the note or its heading is gone, the
 * entry keeps the text it last had. After a reload the notes of the log's entries are read again.
 */
export class FoundTexts {
  private readonly kept = new Map<string, Kept>();
  private readonly images: QuestImages;
  private readonly reads = new Map<string, number>();
  private refs: { readonly vault: EventRef[]; readonly meta: EventRef[] } = { vault: [], meta: [] };

  constructor(private readonly app: App, private readonly log: TableLog, private readonly stored?: AssetStoring) {
    this.images = new QuestImages(app);
  }

  /** Reads the notes of the log's found entries again (after a reload); their notes are followed from then on. */
  start(): void {
    for (const entry of this.log.entries()) if (isFound(entry) && entry.pin !== undefined) void this.refresh(entry.id, entry.pin.link, entry.pin);
  }

  stop(): void {
    this.kept.clear();
    for (const ref of this.refs.meta) this.app.metadataCache.offref(ref);
    for (const ref of this.refs.vault) this.app.vault.offref(ref);
    this.refs = { vault: [], meta: [] };
  }

  /** What players would read of a pin's note now, from the map it is on; null where it cannot be read. */
  async read(link: string, map: string): Promise<FoundRead | null> {
    const reading = await readPinNote(this.app, link, map).catch(() => null);
    return reading === null ? null : { reading, handout: await foundHandout(reading, this.images, this.stored) };
  }

  /** Reads every kept note again: its references may go another way now (the store refused ids). */
  refreshAll(): void {
    for (const [id, kept] of this.kept) void this.refresh(id, kept.path + headingPart(kept.pin.link), kept.pin);
  }

  /** Keeps the note of a new entry current and its assets stored. */
  keep(id: string, read: FoundRead, pin: FoundPin): void {
    this.kept.set(id, { path: read.reading.path, pin, handout: read.handout });
    this.listen();
  }

  /** Hears of the vault's changes while any found note is kept. */
  private listen(): void {
    if (this.refs.meta.length > 0) return;
    const { vault, metadataCache } = this.app;
    const imageChanged = (file: TAbstractFile): void => this.imageChanged(file);
    this.refs = {
      meta: [metadataCache.on('changed', (file) => this.noteChanged(file.path))],
      vault: [
        vault.on('modify', imageChanged), vault.on('create', imageChanged), vault.on('delete', imageChanged),
        vault.on('rename', (file, oldPath) => this.renamed(file, oldPath)),
      ],
    };
  }


  private noteChanged(path: string): void {
    for (const [id, kept] of this.kept) if (kept.path === path) void this.refresh(id, path + headingPart(kept.pin.link), kept.pin);
  }

  /** An image may be one a found note embeds, or one it names that was not there before: notes with embeds are read again. */
  private imageChanged(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension === 'md') return;
    for (const [id, kept] of this.kept) if (kept.handout.note.images !== undefined || /!\[/.test(kept.handout.note.body)) void this.refresh(id, kept.path + headingPart(kept.pin.link), kept.pin);
  }

  private renamed(file: TAbstractFile, oldPath: string): void {
    for (const [id, kept] of this.kept) if (kept.path === oldPath) this.kept.set(id, { ...kept, path: file.path });
    this.imageChanged(file);
  }

  /** Reads an entry's note again and tells everyone of a change; one that is gone keeps its entry as it is, and the last read wins. */
  private async refresh(id: string, link: string, pin: FoundPin): Promise<void> {
    const turn = (this.reads.get(id) ?? 0) + 1;
    this.reads.set(id, turn);
    const read = await this.read(link, pin.map);
    const entry = this.log.entries().find((logged) => logged.id === id);
    if (this.reads.get(id) !== turn || entry === undefined || !isFound(entry)) return;
    this.reads.delete(id);
    if (read === null) return;
    this.keep(id, read, pin);
    this.images.retain(new Set([...this.kept.values()].flatMap((kept) => [...kept.handout.images])));
    const note = read.handout.note;
    if (noteKey(note) === noteKey(entry)) return;
    const { text: _text, images: _images, title: _title, body: _body, ...rest } = entry;
    this.log.revise({ ...rest, ...note });
  }
}

/** What a found note shows, to tell whether a new read changed it. */
const noteKey = (note: FoundNote): string => JSON.stringify([note.title, note.body, note.text ?? null, note.images ?? []]);

/** The `#heading` part of a pin's link, or nothing for a whole note. */
function headingPart(link: string): string {
  const hash = link.indexOf('#');
  return hash < 0 ? '' : link.slice(hash);
}
