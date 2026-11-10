/**
 * An answer Atlas gives later, asked once and again after `forget`. The answer to a question asked
 * before `forget` is dropped, and one that failed is `fallback`.
 */
export class AskedAnswer<T> {
  /** The answer, `asking` until it came, null when it is to be asked for. */
  private state: { readonly value: T } | 'asking' | null = null;
  /** Counts the questions, so that the answer to one asked before `forget` is dropped. */
  private asked = 0;

  constructor(private readonly ask: () => Promise<T>, private readonly fallback: T, private readonly answered: () => void) {}

  /** The answer, or undefined while it is asked for (`answered` hears when it came). */
  get(): T | undefined {
    if (this.state === 'asking') return undefined;
    if (this.state !== null) return this.state.value;
    const asked = ++this.asked;
    this.state = 'asking';
    void this.ask().catch((error: unknown) => {
      console.error('[Atlas] Could not read what a book shows:', error);
      return this.fallback;
    }).then((value) => {
      if (asked !== this.asked) return;
      this.state = { value };
      this.answered();
    });
    return undefined;
  }

  /** Asks again at the next `get`: the answer may be another now. */
  forget(): void {
    this.asked += 1;
    this.state = null;
  }
}
