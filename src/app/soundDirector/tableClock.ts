/** The clock a table's sound runs on: one machine's own offline, a shared one online. */
export interface TableClock {
  now(): number;
  /** How far ahead a change begins, so that everyone hears it at once. */
  readonly leadMs: number;
}

/** One line that says who hears the table; online fills it, offline shows the output device. */
export interface AudienceLine {
  line(): string | null;
  onChange(listener: () => void): () => void;
}
