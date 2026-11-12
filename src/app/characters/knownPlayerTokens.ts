import type { GivenTokens } from '../campaigns/players/givenTokens';
import type { TokenAsset } from '../services/AssetService';
import { isPlayerCharacter, libraryTokenOf } from './playerCharacters';
import type { PlayerTokenRef, PlayerTokenSource } from './playerTokens';

/** Where the players' tokens are read from. */
export interface PlayerTokenFacts {
  /** Every library token; none before the index was read. */
  library(): readonly TokenAsset[];
  /** What the players of the campaign this device plays were given; null while it plays none. */
  given(): GivenTokens | null;
}

/**
 * The tokens that are the players' whatever they hold themselves: those placed from a player
 * character of the library (`libraryTokenOf`, `isPlayerCharacter`) and, while a campaign is played,
 * those its players were given. Answers are remembered until `changed` says the facts may differ.
 */
export class KnownPlayerTokens implements PlayerTokenSource {
  private readonly characters = new Map<string, boolean>();
  private given: GivenTokens | null | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly facts: PlayerTokenFacts) {}

  isPlayers(token: PlayerTokenRef): boolean {
    return this.isCharacter(token) || this.isGiven(token);
  }

  /** The library, the played campaign or its players may have changed: every answer is worked out again. */
  changed(): void {
    this.characters.clear();
    this.given = undefined;
    for (const listener of [...this.listeners]) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private isCharacter({ assetId, imagePath = '' }: PlayerTokenRef): boolean {
    if (assetId === undefined && imagePath === '') return false;
    const key = `${assetId ?? ''}\u0000${imagePath}`;
    let known = this.characters.get(key);
    if (known === undefined) {
      const record = libraryTokenOf({ ...(assetId !== undefined && { assetId }), imagePath }, this.facts.library());
      known = record !== null && isPlayerCharacter(record);
      this.characters.set(key, known);
    }
    return known;
  }

  private isGiven({ id, assetId }: PlayerTokenRef): boolean {
    if (this.given === undefined) this.given = this.facts.given();
    const given = this.given;
    if (given === null) return false;
    return (assetId !== undefined && given.characters.has(assetId)) || (id !== undefined && given.tokens.has(id));
  }
}
