import { newPlayerCode, newPlayerId, withoutPlayer, withPlayerFields, type CampaignPlayer, type StoredPlayers } from '../../campaigns/players/playersFile';
import { playerName, type CampaignSeat, type PlayerInfo, type YourCodeMessage } from '../protocol/index.ts';
import { showNotice } from '../../ui/notice';
import { admitNewcomer, NEWER_PLAYERS_TEXT, refusalText, type TableSeats } from './campaignSeats.ts';

/** Where the relay and the players are told: the table's connection. */
export interface RosterLink {
  /** Tells the relay the campaign's players and their own codes. */
  setPlayers(players: readonly CampaignSeat[]): void;
  /** Tells one connected player their own code. */
  sendCode(message: YourCodeMessage, to: string): void;
}

/** What else the roster needs of its table. */
export interface RosterPorts {
  /** Takes a player off the table, for good while it runs. */
  kick(playerId: string): void;
  /** Takes a newcomer off the table without barring them: they may knock again. */
  turnAway(playerId: string): void;
  /** The table's join code, which no player's own code may be. */
  joinCode(): string;
  /** Where new codes are drawn from; the cryptographic source by default. */
  readonly random?: () => number;
}

/**
 * The campaign's players at a running table. The relay is told them on every change of the players
 * file; a player of the campaign who joins is told their own code, and a newcomer the relay let in
 * becomes a player of the campaign with a code of their own, or is turned away where it has no room.
 * The GM adds, renames, removes them and gives them new codes here. A player taken off the table
 * or the campaign while it runs (here or on another device) is never let back in as a newcomer: a
 * relay that still has them (a welcome, a join that crossed the kick) sees them kicked again.
 */
export class TableRoster {
  private stopSeats: () => void = () => undefined;
  /** The campaign's players as last read, so a player another device removes is known to be gone. */
  private known = new Set<string>();
  /** Players kicked or removed from the campaign while the table runs. */
  private readonly gone = new Set<string>();

  constructor(readonly seats: TableSeats, private readonly link: RosterLink, private readonly ports: RosterPorts) {}

  start(): void {
    this.stopSeats();
    this.known = this.ids();
    this.link.setPlayers(this.seats.seats());
    this.stopSeats = this.seats.onChange(() => {
      const now = this.ids();
      for (const id of this.known) if (!now.has(id)) this.gone.add(id);
      this.known = now;
      this.link.setPlayers(this.seats.seats());
    });
  }

  /** A player was taken off the table: should the relay still have them, they are never made a player of the campaign. */
  kicked(playerId: string): void {
    this.gone.add(playerId);
  }

  dispose(): void {
    this.stopSeats();
  }

  /** A player the relay let in; false where they were turned away (kicked, and the GM told why). */
  joined(player: PlayerInfo): boolean {
    const code = this.seats.codeOf(player.id);
    if (code !== null) {
      this.link.sendCode({ t: 'your-code', code, first: false }, player.id);
      return true;
    }
    if (this.gone.has(player.id)) {
      this.ports.kick(player.id);
      return false;
    }
    const admitted = admitNewcomer(this.seats, player, this.ports.joinCode(), this.ports.random);
    if (admitted === null) {
      // Turned away, not barred: once the GM made room their next knock lets them in.
      showNotice(refusalText(this.seats, player.name));
      this.ports.turnAway(player.id);
      return false;
    }
    // The relay knows the new code before the player is told it.
    this.link.setPlayers(this.seats.seats());
    this.link.sendCode({ t: 'your-code', code: admitted.code, first: true }, player.id);
    return true;
  }

  /** Adds a player the GM names, with a code of their own; null where the campaign has no room or its file cannot be written. */
  add(name: string): CampaignPlayer | null {
    const shown = playerName(name);
    if (shown === null) return null;
    const added = admitNewcomer(this.seats, { id: newPlayerId(), name: shown }, this.ports.joinCode(), this.ports.random);
    if (added === null) showNotice(refusalText(this.seats, shown));
    return added;
  }

  rename(playerId: string, name: string): void {
    const shown = playerName(name);
    if (shown !== null && this.seats.codeOf(playerId) !== null) this.write((stored) => withPlayerFields(stored, playerId, { name: shown }));
  }

  /** Gives a player a new code: the old one stops working at once, and a connected player stays and is told the new one. */
  newCode(playerId: string): void {
    if (this.seats.codeOf(playerId) === null) return;
    const code = newPlayerCode(this.seats.codes().add(this.ports.joinCode()), this.ports.random);
    if (this.write((stored) => withPlayerFields(stored, playerId, { code }))) this.link.sendCode({ t: 'your-code', code, first: false }, playerId);
  }

  /** Removes a player from the campaign: the relay forgets them, then they are taken off the table. */
  remove(playerId: string): void {
    if (this.seats.codeOf(playerId) !== null && this.write((stored) => withoutPlayer(stored, playerId))) this.ports.kick(playerId);
  }

  private ids(): Set<string> {
    return new Set(this.seats.players().map((player) => player.id));
  }

  /** Writes the players file, or tells the GM it cannot be written. */
  private write(change: (stored: StoredPlayers) => StoredPlayers): boolean {
    const written = this.seats.change(change);
    if (!written) showNotice(this.seats.refusal() ?? NEWER_PLAYERS_TEXT);
    return written;
  }
}
