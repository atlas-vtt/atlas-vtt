import { GM_AUTHOR, MAX_PLAYERS, type PlayerInfo, type TablePerson } from '../../protocol/index.ts';

/** A player who is back within this time left no line: a phone that slept, a page loaded anew. */
export const LEAVE_GRACE_MS = 30_000;

export interface LogPresencePorts {
  /** A known player's name, or null. */
  nameOf(player: string): string | null;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
  /** A line that a player joined or left belongs in the log. */
  line(kind: 'joined' | 'left', id: string, name: string): void;
  /** Who is at the table changed. */
  changed(): void;
}

/**
 * Who the log counts as at the table: a line said they joined, none yet that they left. A player who
 * drops and is back within `LEAVE_GRACE_MS` leaves no line. Names are remembered from the log's
 * entries and the relay's welcome, so a line can name someone who has gone.
 */
export class LogPresence {
  private readonly ports: LogPresencePorts;
  private readonly present: Set<string>;
  /** Players who left and may be back in time, with the timer of their line. */
  private readonly leaving = new Map<string, number>();
  private readonly names = new Map<string, string>();

  constructor(ports: LogPresencePorts, present: readonly string[], known: Iterable<{ readonly who: string; readonly name: string }>) {
    this.ports = ports;
    this.present = new Set(present);
    for (const { who, name } of known) if (who !== GM_AUTHOR) this.names.set(who, name);
  }

  /** The players counted as at the table, also those who may be back in time. */
  get players(): ReadonlySet<string> {
    return this.present;
  }

  /**
   * The players at the table, as players are told for whispers, then those the log knows who left
   * (`away`), newest last, so the whispers they were part of still name them.
   */
  people(): readonly TablePerson[] {
    const here = [...this.present].flatMap((id) => {
      const name = this.nameOf(id);
      return name === null ? [] : [{ id, name }];
    });
    const away = [...this.names].filter(([id]) => !this.present.has(id)).map(([id, name]) => ({ id, name, away: true as const }));
    return [...here, ...away.slice(-(MAX_PLAYERS * 4 - here.length))];
  }

  nameOf(who: string): string | null {
    return this.names.get(who) ?? this.ports.nameOf(who);
  }

  /** The relay's welcome: exactly these players are connected. */
  welcome(players: readonly PlayerInfo[]): void {
    const here = new Set(players.map((player) => player.id));
    for (const player of players) this.joined(player);
    for (const id of this.present) if (!here.has(id)) this.left(id);
  }

  joined(player: PlayerInfo): void {
    this.names.set(player.id, player.name);
    const timer = this.leaving.get(player.id);
    if (timer !== undefined) {
      this.ports.clearTimer(timer);
      this.leaving.delete(player.id);
      return;
    }
    if (this.present.has(player.id)) return;
    this.present.add(player.id);
    this.ports.changed();
    this.ports.line('joined', player.id, player.name);
  }

  left(id: string): void {
    if (!this.present.has(id) || this.leaving.has(id)) return;
    this.leaving.set(id, this.ports.setTimer(() => {
      this.leaving.delete(id);
      this.present.delete(id);
      this.ports.changed();
      const name = this.nameOf(id);
      if (name !== null) this.ports.line('left', id, name);
    }, LEAVE_GRACE_MS));
  }

  dispose(): void {
    for (const timer of this.leaving.values()) this.ports.clearTimer(timer);
    this.leaving.clear();
  }
}
