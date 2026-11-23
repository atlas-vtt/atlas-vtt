import type { AtlasAccount } from '../../account/AtlasAccount';
import type { MusicKind } from '../../services/itemBundle/itemBundleFormat';
import { MAX_ALBUM_TRACKS } from '../../services/musicBundle/musicBundleFormat';
import type { LibraryFile } from '../../soundLibrary/SoundLibrary';
import { describeError } from '../../utils/errors';
import type { ArmariumApi } from './armariumApi';
import { draftFrom, textLength, type ListingDraft } from './listingDraft';
import { musicProblems, startingTitle } from './musicShareRules';
import type { MusicShareSnapshot, MusicShareTrack, TrackCopyState } from './musicShareState';
import { freshShare, ShareFlow, type ShareFlowDeps } from './ShareFlow';
import { ITEM_NOTES_LIMITS, nextItemVersion } from './shareState';
import type { ListingFields, OwnListing } from './uploadContract';

/** A track's copy as the preparer hands it on: ready with its bytes as this device keeps them. */
export type PreparedTrack = Exclude<TrackCopyState, { state: 'ready' }> | { readonly state: 'ready'; readonly copy: Blob; readonly frames: number };

/** What the share packs: the listing, its version, and the tracks with their copies in playing order. */
export interface MusicPackRequest {
  kind: MusicKind;
  uid: string;
  version: number;
  name: string;
  artist: string;
  notes: string | undefined;
  tracks: { title: string; copy: Blob }[];
  cover: Blob | null;
}

export interface MusicShareDeps extends ShareFlowDeps {
  readonly account: Pick<AtlasAccount, 'state' | 'token' | 'signIn' | 'onChange'>;
  readonly api: ShareFlowDeps['api'] & Pick<ArmariumApi, 'ownListings'>;
  readonly kind: MusicKind;
  readonly files: readonly LibraryFile[];
  /** What the album or single is called to begin with. */
  readonly name: string;
  /** A listing of the account's to continue, as the Armarium page asked; one that is not its music is not taken. */
  readonly listing?: string | undefined;
  /** Prepares a track's Atlas copy, telling each step; the result stops it. */
  readonly prepare: (file: LibraryFile, listener: (state: PreparedTrack) => void) => () => void;
  /** A new listing's uid: 32 random lowercase hex. */
  readonly newUid: () => string;
  readonly pack: (request: MusicPackRequest) => Promise<{ fileName: string; blob: Blob }>;
  readonly fetchCover: (url: string) => Promise<Blob | null>;
}

const SAMPLE_RATE = 48_000;

/**
 * One "Share in the Armarium" of music from the Sound library: the account, then the music (a new listing or the next
 * version of one of the account's music listings, its name, artist, cover and tracks in order), then the upload,
 * checks, listing (its kind is music) and publish as every share. Each track's Atlas copy is prepared as the share
 * opens; one that cannot be is named and left out. Nothing is recorded in the vault: a new listing's uid is random,
 * and a later version is made by choosing the listing again.
 */
export class MusicShareSession extends ShareFlow<MusicShareSnapshot> {
  private readonly copies = new Map<string, { copy: Blob; frames: number }>();
  private readonly stops = new Map<string, () => void>();
  private readonly newUid: string;
  private known: OwnListing[] = [];
  private coverChosen = false;

  constructor(private readonly deps: MusicShareDeps) {
    const tracks: MusicShareTrack[] = deps.files.slice(0, deps.kind === 'music-album' ? MAX_ALBUM_TRACKS : 1).map((file) => ({
      id: `${file.kind}:${file.path}`, file, title: startingTitle(file.name), copy: { state: 'reading' },
    }));
    super(deps, {
      ...freshShare({ ...draftFrom(null, null), kind: 'music' }),
      subject: 'music', listingKind: 'music', kind: deps.kind, name: deps.name.trim(), artist: '', tracks, cut: deps.files.length - tracks.length,
      listings: null, target: null, version: null, notes: '', cover: null, listedCover: null, uploadedCover: null,
    });
    this.newUid = deps.newUid();
  }

  override start(): void {
    super.start();
    for (const track of this.state.tracks) this.prepare(track);
  }

  override dispose(): void {
    for (const stop of this.stops.values()) stop();
    this.stops.clear();
    super.dispose();
  }

  setName(name: string): void {
    this.set({ name, problems: this.without('name') });
  }

  setArtist(artist: string): void {
    this.set({ artist, problems: this.without('artist') });
  }

  setTitle(id: string, title: string): void {
    this.set({ tracks: this.state.tracks.map((track) => (track.id === id ? { ...track, title } : track)), problems: this.without(`title:${id}`) });
  }

  /** Moves a track to `index` in the playing order. */
  moveTrack(id: string, index: number): void {
    const moved = this.state.tracks.find((track) => track.id === id);
    if (!moved) return;
    const others = this.state.tracks.filter((track) => track !== moved);
    const at = Math.max(0, Math.min(index, others.length));
    this.set({ tracks: [...others.slice(0, at), moved, ...others.slice(at)] });
  }

  /** Whether a track may be taken out: an album keeps two, a single its one. */
  mayRemove(): boolean {
    return this.state.kind === 'music-album' && this.state.tracks.length > 2;
  }

  removeTrack(id: string): void {
    if (!this.mayRemove()) return;
    this.stops.get(id)?.();
    this.stops.delete(id);
    this.copies.delete(id);
    this.set({ tracks: this.state.tracks.filter((track) => track.id !== id), problems: this.without('tracks') });
  }

  /** Continues one of the account's music listings, or starts a new one with null. */
  chooseListing(uid: string | null): void {
    const listing = uid === null ? null : this.state.listings?.find((each) => each.uid === uid) ?? null;
    this.set({ target: listing?.uid ?? null, ownListing: listing, version: nextItemVersion(listing), listedCover: null, ...(this.coverChosen ? {} : { cover: null }) });
    if (!this.touched) this.set({ draft: this.draftOf(listing?.fields ?? null) });
    if (listing?.coverUrl) void this.keepListedCover(listing.uid, listing.coverUrl);
  }

  setNotes(notes: string): void {
    this.set({ notes, problems: this.without('notes') });
  }

  setCover(image: Blob | null): void {
    this.coverChosen = true;
    this.set({ cover: image });
  }

  uploadCover(image: Blob): void {
    this.coverChosen = true;
    this.set({ cover: image, uploadedCover: image });
  }

  /** Packs the music and uploads it, once every track is prepared and nothing in the step is wrong. */
  confirmMusic(): void {
    const { step, version } = this.state;
    if (step !== 'bundle' || version === null) return;
    const problems = musicProblems(this.state);
    if (textLength(this.state.notes) > ITEM_NOTES_LIMITS.max) problems.notes = 'too-long';
    if (Object.keys(problems).length > 0) return this.set({ problems });
    this.set({ step: 'upload', packing: { message: '', fraction: 0 }, refusal: null, problems: {} });
    void this.packAndUpload(version);
  }

  protected async listingUid(): Promise<string | null> {
    this.known = (await this.deps.api.ownListings()).filter((listing) => listing.format === this.deps.kind);
    return this.known.some((listing) => listing.uid === this.deps.listing) ? this.deps.listing ?? null : null;
  }

  protected override readOwnListing(uid: string): Promise<OwnListing | null> {
    return Promise.resolve(this.known.find((listing) => listing.uid === uid) ?? null);
  }

  protected opened(ownListing: OwnListing | null): Partial<MusicShareSnapshot> {
    if (ownListing?.coverUrl) void this.keepListedCover(ownListing.uid, ownListing.coverUrl);
    return { listings: this.known, target: ownListing?.uid ?? null, version: nextItemVersion(ownListing) };
  }

  /** What the listing holds for a new version, else an empty form; the kind is music. */
  protected draftOf(stored: ListingFields | null): ListingDraft {
    return { ...draftFrom(stored, null), kind: 'music' };
  }

  protected repack(): void {
    const { version } = this.state;
    if (version === null) return;
    this.set({ packing: { message: '', fraction: 0 }, refusal: null });
    void this.packAndUpload(version);
  }

  protected recordPublished(): Promise<void> {
    return Promise.resolve();
  }

  private without(field: string): Record<string, string> {
    return Object.fromEntries(Object.entries(this.state.problems).filter(([key]) => key !== field && key !== 'tracks'));
  }

  /** Offers the listing's published cover, and packs it unless the creator chose another meanwhile. */
  private async keepListedCover(uid: string, url: string): Promise<void> {
    const listed = await this.deps.fetchCover(url);
    if (listed === null || this.state.target !== uid) return;
    this.set(this.coverChosen ? { listedCover: listed } : { listedCover: listed, cover: listed });
  }

  private prepare(track: MusicShareTrack): void {
    // Held before it starts: a preparer may answer at once, and a track taken out meanwhile hears nothing more.
    this.stops.set(track.id, () => undefined);
    const stop = this.deps.prepare(track.file, (prepared) => {
      if (!this.stops.has(track.id)) return;
      if (prepared.state === 'ready') this.copies.set(track.id, { copy: prepared.copy, frames: prepared.frames });
      const copy: TrackCopyState = prepared.state === 'ready' ? { state: 'ready', seconds: prepared.frames / SAMPLE_RATE, bytes: prepared.copy.size } : prepared;
      this.set({ tracks: this.state.tracks.map((each) => (each.id === track.id ? { ...each, copy } : each)), problems: this.without('') });
    });
    if (this.stops.has(track.id)) this.stops.set(track.id, stop);
    else stop();
  }

  private async packAndUpload(version: number): Promise<void> {
    this.set({ busy: true });
    const { kind, name, artist, notes, cover, target } = this.state;
    const going = this.state.tracks.filter((track) => this.copies.has(track.id));
    const request: MusicPackRequest = {
      kind, uid: target ?? this.newUid, version, name: name.trim(), artist: artist.trim(),
      notes: version > 1 && notes.trim() !== '' ? notes.trim() : undefined,
      tracks: going.map((track) => ({ title: kind === 'music-track' ? name.trim() : track.title.trim(), copy: this.copies.get(track.id)!.copy })),
      cover,
    };
    let packed: { fileName: string; blob: Blob };
    try {
      packed = await this.deps.pack(request);
    } catch (error) {
      console.error('[Atlas] Packing the music for the Armarium failed:', error);
      return this.set({ busy: false, packing: null, refusal: { code: 'export-failed', until: null, detail: describeError(error) } });
    }
    await this.sendBundle(packed.blob, { fileName: packed.fileName, bytes: packed.blob.size, name: request.name, version });
  }
}
