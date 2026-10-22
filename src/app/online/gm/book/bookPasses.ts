/** Which players a pass over the books looks at: everyone, or only these. */
export type PassScope = 'all' | ReadonlySet<string>;

/**
 * The passes over the players' books, asked for many times in a row (a statblock edit is taken,
 * written, read back and drawn, and each says so) and made once: every request until the current
 * task's work is done joins one pass, of everyone once anyone asked for everyone, else of the
 * players named.
 */
export class BookPasses {
  private pending: 'all' | Set<string> | null = null;

  constructor(private readonly run: (scope: PassScope) => void) {}

  /** A pass of everyone. */
  all(): void {
    this.ask(null);
  }

  /** A pass of these players, unless one of everyone is asked for already. */
  of(players: Iterable<string>): void {
    this.ask(players);
  }

  /** A pass of these players at once, with whatever was waiting: what follows must reach them after it. */
  now(players: Iterable<string>): void {
    const waiting = this.pending;
    this.pending = null;
    this.run(waiting === 'all' ? 'all' : new Set([...(waiting ?? []), ...players]));
  }

  /** Joins the pass waiting, or asks for one after the current task's work: of everyone for null. */
  private ask(players: Iterable<string> | null): void {
    const waiting = this.pending;
    if (waiting === 'all') return;
    if (players === null) this.pending = 'all';
    else this.pending = new Set([...(waiting ?? []), ...players]);
    if (waiting === null) queueMicrotask(() => this.flush());
  }

  private flush(): void {
    const scope = this.pending;
    this.pending = null;
    if (scope !== null) this.run(scope);
  }
}
