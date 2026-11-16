import { TEXT_MIME_TYPE, type AssetRef, type BookQuest, type QuestImage } from '../../protocol/index.ts';
import { ASSET_USES, type AssetStoring, type HashedRef } from '../assets/assetUses.ts';
import type { HandedQuest, QuestAsset } from './questGate.ts';

/**
 * The quests as players are sent them: Atlas hands quests on by hash (`QuestHandouts`); here each
 * whole text and image whose source the quest gate names is stored and named by its id, the text
 * from its bytes, an image from its vault file. One the store does not keep is left out (a quest
 * keeps its opening). A quest made with every reference it names is kept by identity, so books still
 * compare quests that way; one that lacked one is made again the next time it is asked for.
 */
export class StoredQuests {
  private done = new WeakMap<HandedQuest, BookQuest>();
  private last: { readonly from: readonly HandedQuest[]; readonly made: readonly BookQuest[] } | null = null;

  constructor(private readonly stored: AssetStoring | undefined, private readonly assetOf: (hash: string) => QuestAsset | undefined) {}

  /** Forgets every quest made: its references are asked for again. */
  clear(): void {
    this.done = new WeakMap();
    this.last = null;
  }

  async of(quests: readonly HandedQuest[]): Promise<readonly BookQuest[]> {
    const made = await Promise.all(quests.map((quest) => this.quest(quest)));
    // The same quests as last time give the same list, so books see no change.
    if (this.last !== null && this.last.from === quests && made.every((quest, index) => quest === this.last?.made[index])) return this.last.made;
    this.last = { from: quests, made };
    return made;
  }

  private async quest(quest: HandedQuest): Promise<BookQuest> {
    const known = this.done.get(quest);
    if (known !== undefined) return known;
    const { text: handedText, images: handedImages, ...rest } = quest;
    const text = handedText === undefined ? null : await this.ref(handedText, 'text');
    const images = await Promise.all((handedImages ?? []).map(async ({ image, ...embed }): Promise<QuestImage | null> => {
      const ref = await this.ref(image, 'image');
      return ref === null ? null : { ...embed, image: ref };
    }));
    const kept = images.filter((image): image is QuestImage => image !== null);
    const made: BookQuest = { ...rest, ...(text !== null && { text }), ...(kept.length > 0 && { images: kept }) };
    if ((handedText === undefined || text !== null) && kept.length === images.length) this.done.set(quest, made);
    return made;
  }

  private ref(ref: HashedRef, use: 'text' | 'image'): Promise<AssetRef | null> {
    return this.stored === undefined ? Promise.resolve(null) : storedRefOf(this.stored, ref, this.assetOf(ref.hash), use);
  }
}

/**
 * A reference made by hash, stored for players and named by its id, where its source is known (a
 * text's bytes, an image's vault file) and the store keeps it; null otherwise. A file changed since the
 * reference was made gives none: the reference named what it was.
 */
export async function storedRefOf(stored: AssetStoring, ref: HashedRef, source: QuestAsset | undefined, use: 'text' | 'image'): Promise<AssetRef | null> {
  if (source === undefined) return null;
  const made = 'bytes' in source
    ? await stored.refOf(source.bytes, use === 'text' ? TEXT_MIME_TYPE : ref.mime, ASSET_USES[use])
    : await stored.fileRef(source.path, ref.mime, ASSET_USES[use]).catch(() => null);
  return made !== null && made.hash === ref.hash ? made : null;
}
