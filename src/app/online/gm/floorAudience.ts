import type { Floor } from './playerFloors.ts';

/**
 * Who stands on which floor of the shared scene, and so who hears a floor's messages: a message to a
 * player goes out only where it is of their floor, a message to all goes to each player of its floor,
 * and to all at once only while every player of the scene stands on the presented floor (so a player
 * who joins meanwhile hears only the floor players without a token see).
 */
export class FloorAudience {
  private members = new Map<string, Floor>();
  private together = true;
  private shown: Floor = null;

  /** Whether every player of the scene stands on the presented floor. */
  get allTogether(): boolean {
    return this.together;
  }

  /** Each connected player's floor now, whether all players of the scene stand on the presented floor, and that floor; the floors before. */
  set(floors: ReadonlyMap<string, Floor>, together: boolean, presented: Floor): ReadonlyMap<string, Floor> {
    const before = this.members;
    this.members = new Map(floors);
    this.together = together;
    this.shown = presented;
    return before;
  }

  /** Whether a player's floor is known. */
  has(player: string): boolean {
    return this.members.has(player);
  }

  /** A player's floor, the presented one while theirs is not known. */
  floorOf(player: string): Floor {
    return this.members.has(player) ? this.members.get(player)! : this.shown;
  }

  /** The connected players on a floor. */
  playersOn(floor: Floor): string[] {
    return [...this.members].flatMap(([player, at]) => (at === floor ? [player] : []));
  }

  delete(player: string): void {
    this.members.delete(player);
  }

  clear(): void {
    this.members.clear();
  }

  /**
   * Sends a message of `floor` to `to` where that player stands on it, and to all (`to` unset) to the
   * floor's players: in one message to all while everyone stands on it as the presented floor.
   * `floorOf` places a player not yet placed.
   */
  route(floor: Floor, to: string | undefined, floorOf: (player: string) => Floor, send: (to?: string) => void): void {
    if (to !== undefined) {
      if (floorOf(to) === floor) send(to);
      return;
    }
    if (this.together && floor === this.shown) return send();
    for (const player of this.playersOn(floor)) send(player);
  }
}
