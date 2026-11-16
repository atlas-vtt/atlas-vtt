/** How many pictures of the dungeon (dungeon, view and card size) keep their thumbnails. */
const KEPT_PICTURES = 2;

/**
 * Card thumbnails (one per style, or per theme), per picture of the dungeon. The newest pictures
 * keep theirs, so switching a view back finds its cards drawn; older ones close their bitmaps.
 * The cards show a picture only once every card of it came back, so a gallery changes at once
 * instead of card by card; until then they keep the last picture that did.
 */
export class ThumbnailCache<Card extends string = string> {
  private readonly pictures = new Map<string, Map<Card, ImageBitmap>>();
  /** Cards of a kept picture that could not be drawn: they count as back, and stay skeletons. */
  private readonly failed = new Map<string, Set<Card>>();
  /** The picture the cards show; kept whatever else comes. */
  private shownPicture: string | null = null;
  private readonly none: ReadonlyMap<Card, ImageBitmap> = new Map();

  constructor(private readonly cards: readonly Card[]) {}

  /** The thumbnails of a picture, which becomes the newest. */
  of(picture: string): ReadonlyMap<Card, ImageBitmap> {
    const kept = this.pictures.get(picture) ?? new Map<Card, ImageBitmap>();
    this.pictures.delete(picture);
    this.pictures.set(picture, kept);
    for (const [key, thumbnails] of this.pictures) {
      if (this.pictures.size <= KEPT_PICTURES) break;
      if (key === this.shownPicture || key === picture) continue;
      this.close(thumbnails);
      this.pictures.delete(key);
      this.failed.delete(key);
    }
    return kept;
  }

  /** What the cards show while `picture` is wanted: it once all its cards are back, else the last that was. */
  shown(picture: string): ReadonlyMap<Card, ImageBitmap> {
    const kept = this.of(picture);
    const failed = this.failed.get(picture);
    if (this.cards.every(card => kept.has(card) || failed?.has(card))) this.shownPicture = picture;
    const shown = this.shownPicture === null ? undefined : this.pictures.get(this.shownPicture);
    return shown ?? this.none;
  }

  /** Keeps a thumbnail while its picture is kept; closes it otherwise. Whether it was kept. */
  put(picture: string, card: Card, bitmap: ImageBitmap): boolean {
    const kept = this.pictures.get(picture);
    if (!kept || kept.has(card)) {
      bitmap.close();
      return false;
    }
    kept.set(card, bitmap);
    return true;
  }

  /** Notes a card that could not be drawn, so its picture is not held back for it. Whether it was kept. */
  fail(picture: string, card: Card): boolean {
    if (!this.pictures.has(picture)) return false;
    const failed = this.failed.get(picture) ?? new Set<Card>();
    failed.add(card);
    this.failed.set(picture, failed);
    return true;
  }

  clear(): void {
    for (const thumbnails of this.pictures.values()) this.close(thumbnails);
    this.pictures.clear();
    this.failed.clear();
    this.shownPicture = null;
  }

  private close(thumbnails: Map<Card, ImageBitmap>): void {
    for (const bitmap of thumbnails.values()) bitmap.close();
  }
}
