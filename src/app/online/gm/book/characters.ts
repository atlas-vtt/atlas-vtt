import type { BookCharacter } from '../../protocol/index.ts';
import type { PlacedTokenSource } from '../../../characters/playerCharacters';
import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import type { ShownRollToken } from '../../../services/playerRollSource';
import type { TokenEntity } from '../../../types';
import type { BookScene } from './bookScene.ts';

/** The character a player plays, whose book is theirs for as long. */
export interface PlayedCharacter {
  readonly collection: string;
  /** The character in its collection: its token's artwork path. It names the book and is never sent. */
  readonly key: string;
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
  /** The sheet of a token the players' frame shows, or null when none can be made of it. */
  sheet(shown: ShownRollToken, token: TokenEntity): BookCharacter | null;
  /** The statblock note the library token a placed token came from links, or null. */
  libraryStatblock(placed: PlacedTokenSource): string | null;
}

const placedOf = (token: TokenEntity): PlacedTokenSource => (token.assetId === undefined ? { imagePath: token.imagePath } : { assetId: token.assetId, imagePath: token.imagePath });

/** A token's own statblock note, else its library token's. */
const statblockOf = (token: TokenEntity, inputs: CharacterInputs): string | null =>
  (token.kind === 'character' && token.statblockPath ? token.statblockPath : null) ?? inputs.libraryStatblock(placedOf(token));

const bookOf = (character: Pick<PlayedCharacter, 'collection' | 'key'>): string => `${character.collection}\n${character.key}`;

/**
 * Which character each player of the table plays: the token they chose (`choose`: the one they act
 * with on their page), else the first token they own in the shared scene, in the scene's order (the
 * token the GM's player list shows them by), as the players' frame shows it. A choice of a token
 * that is not theirs, or that the players' frame does not show, is passed over.
 * A character stays its player's for the table while the scene shows none of their tokens (another
 * scene, the token hidden or out of sight), with the sheet it last had. It ends when its token is
 * in the shared scene and no longer theirs (the GM gave it to someone else or took it back), when the table no longer knows the player, or when they play another character.
 * A book is open to one player at a time: a token with the artwork of a character someone else
 * plays is passed over, so two players never read one book.
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

  /** The statblock notes of every character played. */
  statblockPaths(): Set<string> {
    return new Set([...this.played.values()].flatMap((character) => (character.statblockPath === null ? [] : [character.statblockPath])));
  }

  /** The sheet of a player's character with a resource's value as it was written, for a character whose token no shown scene holds to be read from. */
  setValue(player: string, key: string, current: number): void {
    const character = this.played.get(player);
    if (character === undefined) return;
    const resources = character.sheet.resources.map((resource) => (resource.key === key ? { ...resource, current } : resource));
    const held = character.drawnWith.resources;
    const value = held?.[key];
    const drawnWith = value === undefined ? character.drawnWith : { ...character.drawnWith, resources: { ...held, [key]: { ...value, current } } };
    this.played.set(player, { ...character, sheet: { ...character.sheet, resources }, drawnWith });
  }

  /** Reads the shared scene: who plays which character now. */
  update(scene: BookScene, inputs: CharacterInputs): void {
    for (const [player, character] of [...this.played]) {
      const givenAway = Object.hasOwn(scene.tokens, character.tokenId) && inputs.ownerOf(character.tokenId) !== player;
      if (givenAway || !inputs.isKnown(player)) this.played.delete(player);
    }
    for (const player of [...this.chosen.keys()]) if (!inputs.isKnown(player)) this.chosen.delete(player);
    const holders = new Map([...this.played].map(([player, character]) => [bookOf(character), player]));
    const owned = Object.keys(scene.tokens).filter((tokenId) => inputs.ownerOf(tokenId) !== undefined);
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
      const character = { collection: scene.collection, key: seen.imagePath };
      const holder = holders.get(bookOf(character));
      const sheet = holder === undefined || holder === owner ? inputs.sheet(seen, token) : null;
      if (sheet === null) continue;
      if (before !== undefined) holders.delete(bookOf(before));
      holders.set(bookOf(character), owner);
      const drawnWith = { definitions: scene.resources, resources: token.resources };
      this.played.set(owner, { ...character, tokenId, placed: placedOf(token), sheet, statblockPath: statblockOf(token, inputs), drawnWith });
      settled.add(owner);
    }
  }
}
