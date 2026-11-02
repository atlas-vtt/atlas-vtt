import { MAX_PREPARED_SOUNDS, type AssetRef, type GmMessage } from '../../protocol/index.ts';
import type { Mood, SoundRecord } from '../../../sound/soundTypes';
import { moodAfter } from '../../../soundLibrary/moodOrdering';
import { ASSET_USES } from '../assets/assetUses.ts';
import type { SoundRefs } from './soundRefs.ts';

export interface OffersPorts {
  readonly refs: Pick<SoundRefs, 'ensure'>;
  send(body: GmMessage, to?: string): void;
  /** The scene players are shown; null while none. */
  presentedPath(): string | null;
  /** The moods a scene links. */
  sceneMoods(path: string): Promise<Mood[]>;
  moods(): readonly Mood[];
  /** The mood the mix is, if it is one. */
  activeMood(): { readonly id: string } | null;
  recordsOf(mood: Mood): SoundRecord[];
  /** The key a record's copy goes by here; null while it has none, which asks for one. */
  copyKey(record: SoundRecord): string | null;
}

/**
 * What goes into the store before anyone presses it: the moods the scene players are shown links, then
 * the next mood, named to players as what to fetch ahead (`sound-prepare`), and behind those the rest of
 * the moods, or a folder the GM prepared, which players hear of only when they play. A sound without a
 * copy here yet is asked for, and offered when the shelf says it has come.
 */
export class SoundOffers {
  /** Records waiting to be offered, and whether near at hand. */
  private readonly waiting = new Map<string, { readonly record: SoundRecord; readonly handed: boolean }>();
  private hint: GmMessage | null = null;
  private generation = 0;

  constructor(private readonly ports: OffersPorts) {}

  /** The table opened, what players are shown changed, or another mood plays: the moods near at hand are worked out again. */
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const path = this.ports.presentedPath();
    const linked = path === null ? [] : await this.ports.sceneMoods(path).catch((): Mood[] => []);
    if (generation !== this.generation) return;
    const moods = this.ports.moods();
    const next = moodAfter(moods, this.ports.activeMood()?.id ?? null);
    const nearRecords = this.recordsOf([...linked, ...(next ? [next] : [])]);
    this.offer(nearRecords, true);
    this.offer(this.recordsOf(moods), false);
    await this.pump();
    if (generation !== this.generation) return;
    const keys = nearRecords.flatMap((record) => this.ports.copyKey(record) ?? []);
    const refs = await Promise.all([...new Set(keys)].slice(0, MAX_PREPARED_SOUNDS).map((key) => this.ports.refs.ensure(key, ASSET_USES.audio, true)));
    if (generation === this.generation) this.sendHint(refs.filter((ref) => ref !== null));
  }

  /** Offers what the moods name, or the sounds given. */
  prepare(sounds?: readonly SoundRecord[]): void {
    this.offer(sounds ?? this.recordsOf(this.ports.moods()), false);
    void this.pump();
  }

  /** Copies came: what waited for them is offered. */
  shelfChanged(): void {
    void this.pump();
  }

  resend(to?: string): void {
    if (this.hint !== null) this.ports.send(this.hint, to);
  }

  private recordsOf(moods: readonly Mood[]): SoundRecord[] {
    return moods.flatMap((mood) => this.ports.recordsOf(mood));
  }

  private offer(records: readonly SoundRecord[], handed: boolean): void {
    // Named near at hand beats offered with the rest.
    for (const record of records) if (handed || !this.waiting.get(record.id)?.handed) this.waiting.set(record.id, { record, handed });
  }

  /** One after the other: offering hashes a copy once, which is memory while it lasts. */
  private async pump(): Promise<void> {
    for (const [id, { record, handed }] of [...this.waiting]) {
      const key = this.ports.copyKey(record);
      if (key === null) continue;
      this.waiting.delete(id);
      await this.ports.refs.ensure(key, handed ? ASSET_USES.audio : ASSET_USES.stagedAudio, handed);
    }
  }

  private sendHint(assets: readonly AssetRef[]): void {
    const hint: GmMessage = { t: 'sound-prepare', assets };
    if (JSON.stringify(hint) === JSON.stringify(this.hint ?? { t: 'sound-prepare', assets: [] })) return;
    this.hint = hint;
    this.ports.send(hint);
  }
}
