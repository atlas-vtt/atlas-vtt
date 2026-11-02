import { MAX_PREPARED_SOUNDS, type AssetRef, type GmMessage } from '../../protocol/index.ts';
import type { Mood, SoundRecord } from '../../../sound/soundTypes';
import type { SceneMoods } from '../../../soundDirector/tableClock';
import { moodAfter } from '../../../soundLibrary/moodOrdering';
import { ASSET_USES, type AssetUse } from '../assets/assetUses.ts';
import type { SoundRefs } from './soundRefs.ts';

export interface OffersPorts {
  readonly refs: Pick<SoundRefs, 'ensure'>;
  send(body: GmMessage, to?: string): void;
  /** The scene players are shown; null while none. */
  presentedPath(): string | null;
  sceneMoods(path: string): Promise<SceneMoods>;
  moodsOf(collectionId: string): readonly Mood[];
  /** The mood the mix is, if it is one. */
  activeMood(): { readonly collectionId: string; readonly id: string } | null;
  recordsOf(mood: Mood): SoundRecord[];
  /** The key a record's copy goes by here; null while it has none, which asks for one. */
  copyKey(record: SoundRecord): string | null;
}

/**
 * What goes into the store before anyone presses it: the moods the scene players are shown links and
 * the next mood, named to players as what to fetch ahead (`sound-prepare`), and behind those the rest
 * of the collection's moods, or of a collection the GM prepared, which players hear of only when they
 * play. A sound without a copy here yet is asked for, and offered when the shelf says it has come.
 */
export class SoundOffers {
  /** Records waiting to be offered, with how. */
  private readonly waiting = new Map<string, { readonly record: SoundRecord; readonly use: AssetUse; readonly handed: boolean }>();
  private hint: GmMessage | null = null;
  private generation = 0;

  constructor(private readonly ports: OffersPorts) {}

  /** The table opened, what players are shown changed, or another mood plays: the moods near at hand are worked out again. */
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const path = this.ports.presentedPath();
    const scene = path === null ? null : await this.ports.sceneMoods(path).catch(() => null);
    if (generation !== this.generation) return;
    const active = this.ports.activeMood();
    const collectionId = active?.collectionId ?? scene?.collectionId ?? null;
    if (collectionId === null) return this.sendHint([]);
    const moods = this.ports.moodsOf(collectionId);
    const next = moodAfter(moods, active?.id ?? null);
    const near = [...(scene?.linked ?? []), ...(next ? [next] : [])];
    const nearRecords = near.flatMap((mood) => this.ports.recordsOf(mood));
    this.offer(nearRecords, ASSET_USES.audio, true);
    this.offer(moods.flatMap((mood) => this.ports.recordsOf(mood)), ASSET_USES.stagedAudio, false);
    await this.pump();
    if (generation !== this.generation) return;
    const keys = nearRecords.flatMap((record) => this.ports.copyKey(record) ?? []);
    const refs = await Promise.all([...new Set(keys)].slice(0, MAX_PREPARED_SOUNDS).map((key) => this.ports.refs.ensure(key, ASSET_USES.audio, true)));
    if (generation === this.generation) this.sendHint(refs.filter((ref) => ref !== null));
  }

  prepare(collectionId: string): void {
    this.offer(this.ports.moodsOf(collectionId).flatMap((mood) => this.ports.recordsOf(mood)), ASSET_USES.stagedAudio, false);
    void this.pump();
  }

  /** Copies came: what waited for them is offered. */
  shelfChanged(): void {
    void this.pump();
  }

  resend(to?: string): void {
    if (this.hint !== null) this.ports.send(this.hint, to);
  }

  private offer(records: readonly SoundRecord[], use: AssetUse, handed: boolean): void {
    // Named near at hand beats offered with the rest.
    for (const record of records) if (handed || !this.waiting.get(record.id)?.handed) this.waiting.set(record.id, { record, use, handed });
  }

  /** One after the other: offering hashes a copy once, which is memory while it lasts. */
  private async pump(): Promise<void> {
    for (const [id, { record, use, handed }] of [...this.waiting]) {
      const key = this.ports.copyKey(record);
      if (key === null) continue;
      this.waiting.delete(id);
      await this.ports.refs.ensure(key, use, handed);
    }
  }

  private sendHint(assets: readonly AssetRef[]): void {
    const hint: GmMessage = { t: 'sound-prepare', assets };
    if (JSON.stringify(hint) === JSON.stringify(this.hint ?? { t: 'sound-prepare', assets: [] })) return;
    this.hint = hint;
    this.ports.send(hint);
  }
}
