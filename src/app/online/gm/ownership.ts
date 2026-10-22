import type { Claim, PlayerInfo } from '../protocol/index.ts';
import { sideOf } from '../../initiative/sides';
import type { TokenEntity } from '../../types';
import type { CampaignPlayer } from '../../campaigns/players/playersFile';
import type { TokenAssignments } from '../../campaigns/players/tokenAssignments';

/**
 * The played campaign's players as the table sees them. The players, the characters they play and
 * the tokens the GM assigns are the campaign's, kept in its players file, so they outlive any one
 * table and follow the GM to every device.
 */
export interface CampaignSeats {
  players(): readonly CampaignPlayer[];
  /** Gives a character (a library token's id) to a player of the campaign, or to nobody with null. */
  setOwner(characterId: string, playerId: string | null): void;
  /** The tokens the campaign assigns: owners of tokens placed from no library token, and the GM's player tokens per scene. */
  assignments(): TokenAssignments;
  /** Gives tokens placed from no library token to a player of the campaign, or to nobody with null. */
  setTokenOwners(tokenIds: readonly string[], playerId: string | null): void;
  /** Makes tokens of the scene at `mapPath` player tokens, or the GM's own; false where they cannot be kept. */
  markPlayerTokens(mapPath: string, tokenIds: readonly string[], player: boolean): boolean;
  /** Calls the listener after every change of the players; returns the way to stop. */
  onChange(listener: () => void): () => void;
}

/** A player token of a scene, or a token a player was given, with its owner if it has one. */
export interface SeatInfo {
  readonly tokenId: string;
  readonly owner: KnownPlayer | null;
}

/** What a token's owner is read by: the library token it was placed from, if any. */
export type OwnedToken = Pick<TokenEntity, 'assetId'>;

/** A player in the GM's list. */
export interface KnownPlayer extends PlayerInfo {
  readonly online: boolean;
}

/** Whether a token is a player token by default: it is on the players' side, as Atlas's initiative and lighting take it (`sideOf`). */
export const isPlayerSide = (token: TokenEntity): boolean => sideOf(token) === 'players';

/**
 * The table's players, token owners and player tokens. The players and their characters are the
 * played campaign's (`CampaignSeats`, bound when a table starts) and stay when a table ends; this
 * tracks who is online. A token has at most one owner: the player the GM gave it to; players take
 * none themselves. As Foundry's actors do, a character is owned and not one placed token: giving a
 * token placed from a library token gives every token placed from it, on every scene, so a player
 * keeps their character when the GM moves to another scene. Which tokens are player tokens the GM
 * decides per scene, and the rest follow the players' side. The owners of tokens placed from no
 * library token and the player tokens are the campaign's too: the table's while one runs, else the
 * played campaign's (`idle`).
 */
export class Ownership {
  private campaign: CampaignSeats | null = null;
  private stopSeats: () => void = () => undefined;
  /** The campaign's characters by library token id with their owner, read from the seats until they change. */
  private characters: ReadonlyMap<string, string> | null = null;
  /** The campaign's players' names by id, read from the seats until they change. */
  private names: ReadonlyMap<string, string> | null = null;
  private readonly online = new Set<string>();
  private readonly listeners = new Set<() => void>();

  /** `idle`: the played campaign, whose tokens are marked while no table runs; null while none is played. */
  constructor(private readonly idle: () => CampaignSeats | null = () => null) {}

  /** Calls the listener after every change; returns the way to stop. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads the players and characters from the played campaign's seats, or from none (null): then nobody plays and nothing can be given. */
  bind(seats: CampaignSeats | null): void {
    this.stopSeats();
    this.campaign = seats;
    this.forgetSeats();
    this.stopSeats = seats?.onChange(() => this.seatsChanged()) ?? ((): void => undefined);
    this.changed();
  }

  /** The relay's welcome: exactly these players are connected. */
  welcome(players: readonly PlayerInfo[]): void {
    this.online.clear();
    for (const player of players) this.online.add(player.id);
    this.changed();
  }

  joined(player: PlayerInfo): void {
    this.online.add(player.id);
    this.changed();
  }

  left(id: string): void {
    if (this.online.delete(id)) this.changed();
  }

  /** Forgets that a player the GM removed from the table is online; they stay in the campaign with their characters. */
  remove(id: string): void {
    if (this.online.delete(id)) this.changed();
  }

  /**
   * Gives the tokens `tokenIds` of a scene's `tokens` to a player of the campaign, or to nobody with
   * null. A token placed from a library token gives its character, so every token placed from it
   * follows. Without a campaign nothing is given.
   */
  give(tokenIds: readonly string[], tokens: Readonly<Record<string, OwnedToken>>, playerId: string | null): void {
    if (this.campaign === null || (playerId !== null && this.nameOf(playerId) === null)) return;
    this.setOwners(tokenIds, tokens, playerId);
    this.changed();
  }

  /** The owner of a token: its character's, else (a token placed from no library token) its own. */
  ownerOf(tokenId: string, token: OwnedToken | undefined): string | undefined {
    const assetId = token?.assetId;
    const owner = (assetId === undefined ? undefined : this.characterOwners().get(assetId)) ?? this.tokens()?.assignments().owners[tokenId];
    return owner === undefined || this.nameOf(owner) === null ? undefined : owner;
  }

  /** The player of the campaign a character (a library token's id) was given to, if any. */
  ownerOfCharacter(characterId: string): string | undefined {
    const owner = this.characterOwners().get(characterId);
    return owner === undefined || this.nameOf(owner) === null ? undefined : owner;
  }

  /** Whether a token of the scene at `mapPath` is a player token: as the GM marked it, else by its side. */
  isPlayerToken(mapPath: string, tokenId: string, token: TokenEntity): boolean {
    return this.tokens()?.assignments().playerTokens[mapPath]?.[tokenId] ?? isPlayerSide(token);
  }

  /** Whether a campaign keeps player tokens now: a table runs, or a campaign is played and its players file was read. */
  canMark(): boolean {
    return this.tokens() !== null;
  }

  /**
   * Makes tokens of a scene player tokens, or the GM's own (`false`), which also takes them back from
   * their owners. False where no campaign keeps them (none is played) or its file cannot be written.
   */
  markPlayerTokens(mapPath: string, tokenIds: readonly string[], tokens: Readonly<Record<string, OwnedToken>>, player: boolean): boolean {
    const seats = this.tokens();
    if (seats === null || !seats.markPlayerTokens(mapPath, tokenIds, player)) return false;
    if (!player) this.setOwners(tokenIds, tokens, null);
    this.changed();
    return true;
  }

  /**
   * What players may know of a token: `taken` for a player token or one a player was given, null for
   * the GM's own. Never `open`: older pages offered such a token to claim, and only the GM gives tokens.
   */
  claimOf(mapPath: string, tokenId: string, token: TokenEntity): Claim {
    return this.ownerOf(tokenId, token) !== undefined || this.isPlayerToken(mapPath, tokenId, token) ? 'taken' : null;
  }

  /** The player tokens of a scene and the tokens players were given there, each with its owner, in the scene's order. */
  seats(mapPath: string, tokens: Readonly<Record<string, TokenEntity>>): SeatInfo[] {
    const players = new Map(this.list().map((player) => [player.id, player]));
    return Object.entries(tokens).flatMap(([tokenId, token]): SeatInfo[] => {
      const owner = this.ownerOf(tokenId, token);
      if (owner === undefined && !this.isPlayerToken(mapPath, tokenId, token)) return [];
      return [{ tokenId, owner: owner === undefined ? null : players.get(owner) ?? null }];
    });
  }

  /** The ids of the players connected now. */
  onlinePlayers(): string[] {
    return [...this.online];
  }

  /** The name a player of the campaign goes by, or null for anyone else. */
  nameOf(playerId: string): string | null {
    this.names ??= new Map((this.campaign?.players() ?? []).map((player) => [player.id, player.name]));
    return this.names.get(playerId) ?? null;
  }

  /** Every player of the campaign: those online first, then by name. */
  list(): KnownPlayer[] {
    return (this.campaign?.players() ?? [])
      .map(({ id, name }) => ({ id, name, online: this.online.has(id) }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }

  /** The campaign whose tokens are assigned: the table's while one runs, else the played one. */
  private tokens(): CampaignSeats | null {
    return this.campaign ?? this.idle();
  }

  private characterOwners(): ReadonlyMap<string, string> {
    this.characters ??= new Map((this.campaign?.players() ?? []).flatMap((player) => player.characters.map((characterId): [string, string] => [characterId, player.id])));
    return this.characters;
  }

  private seatsChanged(): void {
    this.forgetSeats();
    this.changed();
  }

  private forgetSeats(): void {
    this.characters = null;
    this.names = null;
  }

  /**
   * Sets or (null) clears the owner of tokens: their character's, else their own; an owner a token
   * had by its own id goes. Each character is written once, however many of the tokens it placed.
   */
  private setOwners(tokenIds: readonly string[], tokens: Readonly<Record<string, OwnedToken>>, playerId: string | null): void {
    const seats = this.tokens();
    if (seats === null) return;
    const characters = new Set<string>();
    const owned = seats.assignments().owners;
    const placed: string[] = [];
    const released: string[] = [];
    for (const tokenId of tokenIds) {
      const assetId = tokens[tokenId]?.assetId;
      if (assetId === undefined) placed.push(tokenId);
      else {
        characters.add(assetId);
        // A token placed from a library token loses any owner it had by its own id.
        if (tokenId in owned) released.push(tokenId);
      }
    }
    if (placed.length > 0) seats.setTokenOwners(placed, playerId);
    if (released.length > 0) seats.setTokenOwners(released, null);
    for (const assetId of characters) seats.setOwner(assetId, playerId);
    if (characters.size > 0) this.characters = null;
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
