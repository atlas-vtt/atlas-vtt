import { showNotice } from '../ui/notice';


/**
 * Runs a promise without awaiting it. A rejection is logged under `context`
 * instead of surfacing as an unhandled rejection; pass `userMessage` when the
 * user started the action and has to be told that it failed.
 */
export function runInBackground(task: Promise<unknown>, context: string, userMessage?: string): void {
  task.catch((error: unknown) => {
    console.error(`[Atlas] ${context} failed:`, error);
    if (userMessage) showNotice(userMessage);
  });
}
