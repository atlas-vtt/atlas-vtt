import type { DungeonModel, DungeonRequest } from '../../../dungeons/model';
import { DEFAULT_VIEW } from '../../../dungeons/style';
import { DUNGEON_STYLES, type DungeonStyleId } from '../../../dungeons/styleCatalog';
import type { DungeonJob, DungeonRendered } from '../../../dungeons/worker/dungeonJob';
import { ThumbnailCache } from './thumbnailCache';
import type { ThumbnailRenderer, ThumbnailSize } from './useStyleThumbnails';

const GROUP = 'styles';

/**
 * The dungeon every style card shows: a card shows a style's colours, never the GM's dungeon, so
 * nothing the GM chooses draws them again. Small and wet, so its richest room holds floor, water,
 * props and columns; one floor, no boss room. Changing it changes every card.
 */
export const SAMPLE_REQUEST: DungeonRequest = { seed: 7, theme: 'fortress', tags: ['small', 'wet'], floors: 1, bossRoom: false };

const pictureOf = (size: ThumbnailSize): string => `${size.width}x${size.height}@${size.ratio}`;

/**
 * The style cards of the sample dungeon, one set per app for as long as it runs: drawn once per
 * card size (the newest two sizes kept, `ThumbnailCache`) and shown together once all are back.
 * The first card asked for makes the sample in the worker; the others draw the dungeon it made,
 * so it is generated once. A card that could not be drawn is never asked for again.
 */
export class SampleStyleCards {
  private readonly cache = new ThumbnailCache<DungeonStyleId>(DUNGEON_STYLES.map((entry) => entry.id));
  /** Cards asked for (or failed) per picture; a card a drop answered is asked for again. */
  private readonly asked = new Map<string, Set<DungeonStyleId>>();
  private readonly listeners = new Set<() => void>();
  private model: DungeonModel | null = null;
  /** A card is making the sample: the others wait for its model. */
  private making = false;
  private wanted: { picture: string; size: ThumbnailSize; first: DungeonStyleId } | null = null;
  /** Changes whenever a card arrives, for `useSyncExternalStore`. */
  version = 0;

  constructor(private readonly renderer: ThumbnailRenderer) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** What the cards of `size` show: its set once complete, else the last complete one. */
  shown(size: ThumbnailSize): ReadonlyMap<DungeonStyleId, ImageBitmap> {
    return this.cache.shown(pictureOf(size));
  }

  /** Asks for the cards of `size` that are neither drawn nor on their way, `first` first. */
  want(size: ThumbnailSize, first: DungeonStyleId): void {
    const picture = pictureOf(size);
    if (this.wanted && this.wanted.picture !== picture) {
      // Cards of another size not yet started are not drawn: a resize asks for a set per size
      this.renderer.dropThumbnails(GROUP);
    }
    this.wanted = { picture, size, first };
    this.askWanted();
  }

  private askWanted(): void {
    if (!this.wanted) return;
    const { picture, size, first } = this.wanted;
    const kept = this.cache.of(picture);
    const asked = this.asked.get(picture) ?? new Set<DungeonStyleId>();
    this.asked.set(picture, asked);
    const missing = DUNGEON_STYLES.filter((entry) => !kept.has(entry.id) && !asked.has(entry.id));
    missing.sort((a, b) => Number(b.id === first) - Number(a.id === first));
    const todo = this.model ? missing : this.making ? [] : missing.slice(0, 1);
    for (const { id, style } of todo) {
      const job: DungeonJob = {
        request: SAMPLE_REQUEST,
        ...(this.model && { model: this.model }),
        style,
        view: DEFAULT_VIEW,
        output: { kind: 'thumbnail', width: size.width, height: size.height, legibleAt: size.ratio },
      };
      if (!this.model) this.making = true;
      asked.add(id);
      this.renderer.thumbnail(job, GROUP).then(
        (result) => this.arrived(picture, id, result),
        (error: unknown) => {
          console.error('[Atlas] A dungeon style card could not be drawn', error);
          this.settled(this.cache.fail(picture, id));
        },
      );
    }
  }

  private arrived(picture: string, id: DungeonStyleId, result: DungeonRendered | null): void {
    if (!result || result.image.type !== 'bitmap') {
      this.asked.get(picture)?.delete(id);
      this.settled(false);
      return;
    }
    this.model ??= result.model;
    this.settled(this.cache.put(picture, id, result.image.bitmap));
  }

  /** A card came back (or failed, or was dropped): the rest are asked for, and the cards told. */
  private settled(changed: boolean): void {
    this.making = false;
    if (changed) {
      this.version++;
      for (const listener of [...this.listeners]) listener();
    }
    this.askWanted();
  }
}

// ponytail: one set per worker client (per app), its bitmaps freed with the client; no explicit close on unload.
const perRenderer = new WeakMap<ThumbnailRenderer, SampleStyleCards>();

export function sampleStyleCardsFor(renderer: ThumbnailRenderer): SampleStyleCards {
  let cards = perRenderer.get(renderer);
  if (!cards) {
    cards = new SampleStyleCards(renderer);
    perRenderer.set(renderer, cards);
  }
  return cards;
}
