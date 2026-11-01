import type { BookCharacter } from '../../protocol/index.ts';
import type { PlacedTokenSource } from '../../../characters/playerCharacters';
import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import type { ShownRollToken } from '../../../services/playerRollSource';
import type { TokenEntity } from '../../../types';
import type { BookScene } from './bookScene.ts';
import { UNPLACED_PREFIX } from './BookShelf.ts';

/** The character a player plays, whose book is theirs for as long. */
export interface PlayedCharacter {
  /** The collection of the scene the character was read from. */
  readonly collection: string;
  /** The character: its library token's id, else `token:` and its token's id. It names the book and is never sent. */
  readonly key: string;
  /** The artwork its token is shown with: what the character's picture is read from. It is never sent. */
  readonly imagePath: string;
  /** The token the character was read from. */
  readonly tokenId: string;
  /** What names the library token that token was placed from: the character, while its token is in no shown scene. */
  readonly placed: PlacedTokenSource;
  /** The sheet as last read from the scene. */
  readonly sheet: BookCharacter;
  /** The statblock note of the character: its token's, else the one of the library token it was placed from; null for none. */
  readonly statblockPath: string | null;
  /** What its statblock is drawn with, as last read from the scene: the scene's resources and the values its token holds. */
  readonly drawnWith: {
    readonly definitions: readonly ResourceDefinition[];
    readonly resources: Readonly<Record<string, ResourceValue>> | undefined;
  };
}

/** Who owns the tokens and who is at the table, and how a token becomes a sheet. */
export interface CharacterInputs {
  ownerOf(tokenId: string): string | undefined;
  /** Whether the table still knows the player. */
  isKnown(player: string): boolean;
  /** The sheet of a token the players' frame shows, with its statblock note, or null when none can be made of it. */
  sheet(shown: ShownRollToken, token: TokenEntity, statblockPath: string | null): BookCharacter | null;
  /** The statblock note the library token a placed token came from links, or null. */
  libraryStatblock(placed: PlacedTokenSource): string | null;
}

const placedOf = (token: TokenEntity): PlacedTokenSource => (token.assetId === undefined ? { imagePath: token.imagePath } : { assetId: token.assetId, imagePath: token.imagePath });

/** A token's own statblock note, else its library token's. */
const statblockOf = (token: TokenEntity, inputs: CharacterInputs): string | null =>
  (token.kind === 'character' && token.statblockPath ? token.statblockPath : null) ?? inputs.libraryStatblock(placedOf(token));

/** The key of the book a token's character keeps: its library token, else the token itself, whose book lives in memory only. */
export const characterKeyOf = (token: TokenEntity): string => token.assetId ?? `${UNPLACED_PREFIX}${token.id}`;

/**
 * Which character each player of the table plays: the token they chose (`choose`: the one they act
 * with on their page), else the first token they own in the shared scene, in the scene's order (the
 * token the GM's player list shows them by), as the players' frame shows it. A choice of a token
 * that is not theirs, or that the players' frame does not show, is passed over.
 * A character stays its player's for the table while the scene shows none of their tokens (another
 * scene, the token hidden or out of sight), with the sheet it last had. It ends when its token is
 * in the shared scene and no longer theirs (the GM gave it to someone else or took it back), when the table no longer knows the player, or when they play another character.
 * A book is open to one player at a time: a token of a library token someone else plays is passed
 * over, so two players never read one book.
 */
export class Characters {
  private readonly played = new Map<string, PlayedCharacter>();
  /** The token each player chose to play, by GM id, until they choose another. */
  private readonly chosen = new Map<string, string>();

  of(player: string): PlayedCharacter | null {
    return this.played.get(player) ?? null;
  }

  /** A player chose the token they play; it counts from the next `update`. False when it was their choice already. */
  choose(player: string, tokenId: string): boolean {
    if (this.chosen.get(player) === tokenId) return false;
    this.chosen.set(player, tokenId);
    return true;
  }

  /** Every character played now. */
  all(): PlayedCharacter[] {
    return [...this.played.values()];
  }

  /** The players who play the character `key` now. */
  playersOf(key: string): string[] {
    return [...this.played].flatMap(([player, character]) => (character.key === key ? [player] : []));
  }

  /** The players whose character's statblock is the note at `path`. */
  playersOfNote(path: string): string[] {
    return [...this.played].flatMap(([player, character]) => (character.statblockPath === path ? [player] : []));
  }

  /** The name each player's character goes by now, by player. */
  names(): Map<string, string> {
    return new Map([...this.played].map(([player, character]) => [player, character.sheet.name]));
  }

  /** The statblock notes of every character played. */
  statblockPaths(): Set<string> {
    return new Set([...this.played.values()].flatMap((character) => (character.statblockPath === null ? [] : [character.statblockPath])));
  }

  /** The sheet of a player's character with a resource's value (and its maximum, where it was set) as it was written, for a character whose token no shown scene holds to be read from. */
  setValue(player: string, key: string, current: number, max?: number): void {
    const character = this.played.get(player);
    if (character === undefined) return;
    const set = <T extends { readonly max: number }>(value: T): T & { current: number } => ({ ...value, current, ...(max !== undefined && { max }) });
    const resources = character.sheet.resources.map((resource) => (resource.key === key ? set(resource) : resource));
    const held = character.drawnWith.resources;
    // A tracked number the token held none of yet takes the maximum the sheet offered it with
    const offered = character.sheet.resources.find((resource) => resource.key === key);
    const value = held?.[key] ?? (offered && { current: offered.current, max: offered.max });
    const drawnWith = value === undefined ? character.drawnWith : { ...character.drawnWith, resources: { ...held, [key]: set(value) } };
    this.played.set(player, { ...character, sheet: { ...character.sheet, resources }, drawnWith });
  }

  /**
   * Reads the shared scene: who plays which character now. With `only`, the characters of those
   * players alone are read again (nothing else in the scene changed for the others).
   */
  update(scene: BookScene, inputs: CharacterInputs, only?: ReadonlySet<string>): void {
    for (const [player, character] of [...this.played]) {
      const givenAway = Object.hasOwn(scene.tokens, character.tokenId) && inputs.ownerOf(character.tokenId) !== player;
      if (givenAway || !inputs.isKnown(player)) this.played.delete(player);
    }
    for (const player of [...this.chosen.keys()]) if (!inputs.isKnown(player)) this.chosen.delete(player);
    const holders = new Map([...this.played].map(([player, character]) => [character.key, player]));
    const owned = Object.keys(scene.tokens).filter((tokenId) => {
      const owner = inputs.ownerOf(tokenId);
      return owner !== undefined && (only === undefined || only.has(owner));
    });
    const shown = scene.shown(owned);
    const settled = new Set<string>();
    const isChosen = (tokenId: string): boolean => {
      const owner = inputs.ownerOf(tokenId);
      return owner !== undefined && this.chosen.get(owner) === tokenId;
    };
    // The token a player chose comes before their others (the sort keeps the scene's order otherwise).
    const inTurn = [...owned].sort((a, b) => Number(isChosen(b)) - Number(isChosen(a)));
    for (const tokenId of inTurn) {
      const owner = inputs.ownerOf(tokenId);
      const token = scene.tokens[tokenId];
      if (owner === undefined || token === undefined || settled.has(owner) || !inputs.isKnown(owner)) continue;
      const before = this.played.get(owner);
      const seen = shown.get(tokenId);
      if (seen?.imagePath === undefined) {
        // Their character's token, not shown now: it stays as it was, before any further token of theirs.
        if (before?.tokenId === tokenId) settled.add(owner);
        continue;
      }
      const character = { collection: scene.collection, key: characterKeyOf(token), imagePath: seen.imagePath };
      const holder = holders.get(character.key);
      const statblockPath = statblockOf(token, inputs);
      const sheet = holder === undefined || holder === owner ? inputs.sheet(seen, token, statblockPath) : null;
      if (sheet === null) continue;
      if (before !== undefined) holders.delete(before.key);
      holders.set(character.key, owner);
      const drawnWith = { definitions: scene.resources, resources: token.resources };
      this.played.set(owner, { ...character, tokenId, placed: placedOf(token), sheet, statblockPath, drawnWith });
      settled.add(owner);
    }
  }
}
