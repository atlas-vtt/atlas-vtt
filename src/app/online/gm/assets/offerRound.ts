import type { OfferAnswer } from './assetRoutes.ts';
import { ASSET_RANKS } from './assetUses.ts';
import { entryPyramid, type QueueEntry, type UploadQueue } from './uploadQueue.ts';

/** An asset as one offer named it: the entry, and the size the offer asked the store to keep. */
export interface Offered {
  readonly entry: QueueEntry;
  readonly size: number;
}

/** What answering an offer does beyond the queue's own state. */
export interface OfferRoundPorts {
  readonly queue: UploadQueue;
  stored(entry: QueueEntry): void;
  /** The account may not store now: nothing more goes up. */
  restricted(): void;
  /** Tells the GM once that a map is too large to share with players. */
  mapTooLarge(): void;
  /** The store takes no pyramids: maps go as images from now on. */
  noTiles(): void;
  /** Offers a pyramid again at the true size it was lowered to, so the store keeps no more for it. */
  settle(entry: QueueEntry): void;
  /** Takes an asset the store reserved room for out of it again (its pyramid was given up meanwhile). */
  remove(id: string): void;
  /** Offers again, after a while, an asset the store will have room for once it made some. */
  retryLater(entry: QueueEntry): void;
}

/** A scene's map: its image, or its tile pyramid. */
const isMap = (entry: QueueEntry): boolean => entry.kind === 'tiles' || entry.map !== undefined || entry.rank === ASSET_RANKS.map;

/**
 * Takes the store's answers to one offer: stored already, wanted (a pyramid starts, and is offered again
 * where its size was lowered meanwhile), or refused. A refusal for room that will pass is offered again
 * later; a pyramid refused for another size than the store holds part of it at is offered at its true
 * size, now or once its levels are cut; any other refusal leaves the asset unshown to players, and only a map players were handed that
 * is too large for the store tells the GM, once. An entry forgotten while its offer was on its way (its
 * pyramid was given up) is taken out of the store again where the store reserved room for it. Answers
 * the entries players were handed that the store will not keep now.
 */
export function answerOffer(offered: readonly Offered[], answers: ReadonlyMap<string, OfferAnswer>, now: number, ports: OfferRoundPorts): QueueEntry[] {
  const refused: QueueEntry[] = [];
  for (const { entry, size } of offered) {
    const answer = answers.get(entry.id);
    if (ports.queue.get(entry.id) !== entry) {
      if (answer?.answer === 'need') ports.remove(entry.id);
      continue;
    }
    const outcome = ports.queue.answered(entry, answer, now);
    if (outcome === null) continue;
    if (outcome === 'have') {
      ports.stored(entry);
      continue;
    }
    if (outcome === 'need') {
      entryPyramid(entry)?.start();
      if (entry.size < size) ports.settle(entry);
      continue;
    }
    const pyramid = entryPyramid(entry);
    // The store holds part of this pyramid at its true size: offered at that size, now or once its levels are cut.
    if (outcome === 'changed' && pyramid !== null) {
      if (pyramid.realBytes === null) continue;
      // Refused at its true size already: the store holds part of another pyramid under this id, and no offer will do.
      if (pyramid.realBytes >= size) {
        pyramid.fail();
        continue;
      }
      entry.size = Math.min(entry.size, pyramid.realBytes);
      entry.state = 'new';
      entry.refusal = null;
      continue;
    }
    if (outcome === 'restricted') ports.restricted();
    else if (outcome === 'quota' && answer?.answer === 'refused' && answer.retry === true) ports.retryLater(entry);
    else if (outcome === 'too-large' && entry.handed && isMap(entry)) ports.mapTooLarge();
    else if (outcome === 'kind' && entry.kind === 'tiles') ports.noTiles();
    pyramid?.stop();
    if (entry.handed) refused.push(entry);
  }
  return refused;
}
