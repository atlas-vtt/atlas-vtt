import { parsePlayerMessage } from '../../protocol/index.ts';
import { AssetAnswers } from '../assetAnswers.ts';
import { bookAssetOf, bookPicture, type NamedAssets } from './bookAssets.ts';
import type { BookSharePorts } from './bookSharePorts.ts';
import type { QuestAsset } from './questGate.ts';

/**
 * Serves each player by hash what only their own book names (`bookAssetOf`): their character's
 * artwork while the scene does not show it, a whole text of their statblock, the world map and the
 * maps it leads into, their quests' texts and images. Nobody gets another character's.
 */
export class BookAssetDesk {
  private readonly answers: AssetAnswers;

  /** `named` gives what a player's book names now, or null for a player who is not connected. */
  constructor(private readonly ports: BookSharePorts, private readonly named: (player: string) => NamedAssets | null) {
    const picture = bookPicture((hash, player) => this.assetOf(hash, player));
    this.answers = new AssetAnswers({ send: (body, to) => ports.send(body, to), now: () => ports.now(), readImage: (path) => ports.readImage(path), scaleImage: ports.scaleImage }, picture);
  }

  /** A player's asset request: true when their book names what it asks for, which is then answered. */
  receive(from: string, body: Record<string, unknown>): boolean {
    const request = parsePlayerMessage(body);
    if (request?.t !== 'asset-request' || this.assetOf(request.hash, from) === undefined) return false;
    this.answers.answer(from, request);
    return true;
  }

  /** Chunks queued for one player (every player for none) are dropped, and their assets may be asked for again at once. */
  forget(player?: string): void {
    this.answers.forget(player);
  }

  private assetOf(hash: string, player: string): QuestAsset | undefined {
    const named = this.named(player);
    return named === null ? undefined : bookAssetOf(hash, named, (asked) => this.ports.questAsset(asked));
  }
}
