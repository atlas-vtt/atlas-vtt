/**
 * Obsidian's `Tasks`, as the window's quit hook uses them (`registerQuitHook`, read in 1.14.5
 * and 1.15.1): the `quit` event collects them, `add` starting its task at once. With none the
 * window closes as asked. With any, Obsidian calls the close off, waits for `promise()` and
 * closes the window itself, which a rejection keeps it from.
 */
export class QuitTasks {
  private readonly promises: Array<Promise<unknown>> = [];

  add(callback: () => Promise<unknown>): void {
    this.promises.push(callback());
  }

  addPromise(promise: Promise<unknown>): void {
    this.promises.push(promise);
  }

  isEmpty(): boolean {
    return this.promises.length === 0;
  }

  promise(): Promise<unknown> {
    return Promise.all(this.promises);
  }
}

export type Outcome = 'pending' | 'done' | 'rejected';

/** Follows a promise: `outcome()` says where it stands once the microtasks queued so far have run. */
export function follow(promise: Promise<unknown>): { outcome: () => Outcome } {
  let outcome: Outcome = 'pending';
  promise.then(() => { outcome = 'done'; }, () => { outcome = 'rejected'; });
  return { outcome: () => outcome };
}

/**
 * Runs every microtask queued now and by those, and no timer: what happens before the task that
 * queued them ends, which for the quit event is before `beforeunload` is over.
 */
export async function restOfTheTask(): Promise<void> {
  for (let turn = 0; turn < 100; turn += 1) await Promise.resolve();
}
