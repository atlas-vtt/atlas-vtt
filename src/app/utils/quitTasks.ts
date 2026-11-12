import type { Tasks } from 'obsidian';
import { settledWithin } from './settledWithin';

/**
 * The longest Obsidian waits for one of Atlas' quit tasks. Obsidian's main process destroys a
 * closing window three seconds after its close began, whatever its page is doing; a task done
 * before that lets the window close by itself, with its unload events.
 */
export const QUIT_WAIT_MS = 2000;

/**
 * Has Obsidian wait for `work` before it quits or closes its window: a task of the `quit` event.
 *
 * Call it only for work there is. With a task of any kind Obsidian calls the close off, shows
 * "Saving…" and closes the window itself once every task is done, and Electron's quit is off by
 * then: what quits the app is Obsidian's answer to its last window closing, which up to 1.14
 * never quits on macOS. A task added on every quit left Obsidian running in the Dock there.
 *
 * What Obsidian waits for never keeps it from quitting: it never rejects (Obsidian would not
 * close the window), is done after `QUIT_WAIT_MS` whatever `work` does, and never within the
 * event's own task, since Obsidian closes the window the moment its tasks are done and a close
 * asked for while `beforeunload` is still being handled is ignored.
 */
export function waitBeforeQuit(tasks: Tasks, work: Promise<unknown>, context: string): void {
  const logged = work.catch((error: unknown) => { console.error(`[Atlas] ${context} before quitting failed:`, error); });
  tasks.addPromise(Promise.all([settledWithin(logged, QUIT_WAIT_MS), nextTask()]));
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, 0); });
}
