import type { App } from 'obsidian';
import { readQuestBody } from '../campaigns/quests/questText';
import type { Quest } from '../campaigns/quests/questTypes';
import { bookQuestOf } from '../online/gm/book/bookQuests.ts';
import type { HandedImage, HandedQuest, QuestAsset } from '../online/gm/book/questGate.ts';
import { questTextParts, type QuestTextParts } from '../online/gm/book/questTexts.ts';
import { QuestImages, stampOf, type ResolvedEmbed } from './questImages';

/** A quest as it was last handed on: kept while its note's reading (the same object), its id and the images it embeds stay. */
interface Handout {
  readonly quest: Quest;
  readonly id: string;
  /** The note's text as it was read, so a change of its properties alone hashes nothing again. */
  readonly body: string;
  readonly text: QuestTextParts;
  /** The versions of the images its embeds named when it was made. */
  readonly stamps: string;
  /** Its images' vault paths, by hash. */
  readonly images: ReadonlyMap<string, string>;
  readonly book: HandedQuest | null;
}

const stampsOf = (resolved: readonly ResolvedEmbed[]): string => resolved.map((embed) => stampOf(embed.file)).join('\n\n');

/**
 * Quests as players are sent them, with the assets their books name: the whole text, and the vault
 * images their text embeds. A note's text is read again only when its reading changes and hashed
 * again only when it changed; its images are looked up on every read (no file is read for that)
 * and read again only when an embed names another file or a file it names changes. A quest that comes out
 * as it was keeps its object, so books compare quests by identity.
 */
export class QuestHandouts {
  private readonly handed = new Map<string, Handout>();
  private readonly images: QuestImages;

  constructor(private readonly app: App) {
    this.images = new QuestImages(app);
  }

  /** The quest as players read it under `id`; null for a note that is gone or a quest whose title shows nothing. */
  async of(quest: Quest, id: string): Promise<HandedQuest | null> {
    const known = this.handed.get(quest.path);
    const same = known !== undefined && known.quest === quest && known.id === id;
    const body = same ? known.body : await readQuestBody(this.app, quest.path).catch(() => null);
    if (body === null) return this.forget(quest.path);
    const text = known?.body === body ? known.text : await questTextParts(body);
    const resolved = this.images.resolve(quest.path, text.embeds);
    const stamps = stampsOf(resolved);
    if (same && known.stamps === stamps) return known.book;
    const refs = await Promise.all(resolved.map((embed) => this.images.refOf(embed.file)));
    const images: HandedImage[] = [];
    const paths = new Map<string, string>();
    resolved.forEach(({ target, width, height, file }, n) => {
      const image = refs[n];
      if (image === null || image === undefined) return;
      images.push({ target, width, height, image });
      paths.set(image.hash, file.path);
    });
    const made = bookQuestOf(quest, id, { opening: text.opening, text: text.whole?.ref, images });
    const kept = known?.book ?? null;
    const book = made !== null && kept !== null && JSON.stringify(kept) === JSON.stringify(made) ? kept : made;
    this.handed.set(quest.path, { quest, id, body, text, stamps, images: paths, book });
    return book;
  }

  /** Forgets every quest but those at `paths`, and the images only they embedded. */
  retain(paths: ReadonlySet<string>): void {
    for (const path of [...this.handed.keys()]) if (!paths.has(path)) this.handed.delete(path);
    this.images.retain(new Set([...this.handed.values()].flatMap((handout) => [...handout.images.values()])));
  }

  /** What the asset `hash` of a quest handed on is read from for the store: a whole text's bytes, or an image's vault path. */
  asset(hash: string): QuestAsset | undefined {
    for (const handout of this.handed.values()) {
      if (handout.text.whole?.ref.hash === hash) return { bytes: handout.text.whole.bytes };
      const path = handout.images.get(hash);
      if (path !== undefined) return { path };
    }
    return undefined;
  }

  /** Whether any quest handed on embeds anything an image could stand for, so a change of a vault image may change it. */
  embedsImages(): boolean {
    return [...this.handed.values()].some((handout) => handout.text.embeds.length > 0);
  }

  private forget(path: string): null {
    this.handed.delete(path);
    return null;
  }
}
