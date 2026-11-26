import type { SharedRollDice } from '../protocol/index.ts';
import { Feed, type BuildCause, type FeedPorts, type FeedScene } from './feed/Feed.ts';
import type { FeedOut } from './feed/feedOutbox.ts';

/** Who is connected, who owns which token, and the dice a token rolls with. */
export interface MineSource {
  /** The ids of the players connected now. */
  onlinePlayers(): readonly string[];
  /** The owner of a token of the GM's scene, by its GM id. */
  ownerOf(tokenId: string): string | undefined;
  /** The dice of a token's own set (its character's template's), by its GM id; undefined where it rolls with the map's. */
  diceOf?(tokenId: string): SharedRollDice | undefined;
}

/** The token list players were last sent: its scene, and the random id players know each token by, by GM id. */
export interface ListedTokens {
  readonly scene: string;
  readonly aliases: ReadonlyMap<string, string>;
}

/** The listed tokens that are the player's, as GM id and the id players know it by, sorted by the latter. */
function ownedBy(player: string, listed: ListedTokens, ownerOf: (tokenId: string) => string | undefined): [string, string][] {
  return [...listed.aliases].filter(([tokenId]) => ownerOf(tokenId) === player).sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Tells each connected player which tokens of the last list are theirs, and the dice of those that
 * roll with a set of their own: a `mine` message to that player alone, whenever their share changes.
 * Only tokens in the list are named, so a hidden token a player owns stays unknown to them. Its scene is
 * the list's; sent again, each player's share is worked out afresh.
 */
export class MineShare {
  readonly feed: Feed;
  private listed: ListedTokens | null = null;
  /** Each connected player's tokens of the list, as worked out at the last list or change of who owns or plays. */
  private owned = new Map<string, [string, string][]>();
  /** Whether the next build works out who owns which token of the list again. */
  private recount = false;

  constructor(private readonly source: MineSource, ports: FeedPorts) {
    this.feed = new Feed(ports, { resend: 'build', build: (scene, out, cause) => this.tell(scene, out, cause), opened: () => undefined });
  }

  /** The list players were just sent, or null while no scene's tokens are shared. */
  setList(listed: ListedTokens | null): void {
    this.listed = listed;
    this.feed.setScene(listed === null ? null : { id: listed.scene, lit: false });
    this.update();
  }

  /** Sends each connected player their share where it changed. */
  update(): void {
    this.recount = true;
    this.feed.update();
  }

  private tell(scene: FeedScene, out: FeedOut, cause: BuildCause): void {
    const listed = this.listed;
    if (listed === null) return;
    // The dice of the players' tokens may read otherwise (a token's statblock or art changed): told again where they did, the owners as last worked out.
    if (this.recount || cause === 'resend') this.owned = new Map(this.source.onlinePlayers().map((player) => [player, ownedBy(player, listed, (tokenId) => this.source.ownerOf(tokenId))]));
    this.recount = false;
    out.keepOnly(this.owned);
    for (const [player, owned] of this.owned) {
      const dice = Object.fromEntries(owned.flatMap(([tokenId, alias]) => {
        const own = this.source.diceOf?.(tokenId);
        return own === undefined ? [] : [[alias, own] as const];
      }));
      out.to(player, { t: 'mine', scene: scene.id, tokens: owned.map(([, alias]) => alias), ...(Object.keys(dice).length > 0 && { dice }) });
    }
  }
}
