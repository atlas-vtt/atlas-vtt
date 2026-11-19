import { failureOf, type ArmariumApi } from './armariumApi';
import { CHECKING_STATES } from './shareState';
import { DISCARDABLE_STATES, type SubmissionState } from './uploadContract';

/** What became of an upload the GM left: discarded now, discarded once its checks are done, or nothing was there. */
export type AbandonOutcome = 'discarded' | 'after-checks' | 'nothing';

/** How often, and how long, a left upload under a check is asked about before it is discarded. */
const CHECK_POLL_MS = 5000;
const CHECK_WAIT_MS = 15 * 60_000;

type Api = Pick<ArmariumApi, 'submission' | 'discard'>;
type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** The submission's state as the API has it now: null when it is gone, `fallback` when it cannot be asked. */
async function currentState(api: Api, id: string, fallback: SubmissionState): Promise<SubmissionState | null> {
  try {
    return (await api.submission(id)).state;
  } catch (error) {
    return failureOf(error).code === 'not-found' ? null : fallback;
  }
}

/** Waits for the check of a left upload to end, then discards it; gives up after a while (its draft runs out by itself). */
async function discardAfterChecks(api: Api, id: string, sleep: Sleep): Promise<void> {
  const signal = new AbortController().signal;
  for (let waited = 0; waited < CHECK_WAIT_MS; waited += CHECK_POLL_MS) {
    await sleep(CHECK_POLL_MS, signal);
    const state = await currentState(api, id, 'checking');
    if (state === null || !CHECKING_STATES.includes(state)) {
      if (state !== null && DISCARDABLE_STATES.includes(state)) await api.discard(id).catch(() => undefined);
      return;
    }
  }
}

/**
 * Takes back an upload the GM left before publishing, so it holds none of the account's open uploads. One under a
 * check cannot be discarded until the check ends: it is discarded then, in the background.
 */
export async function abandonSubmission(api: Api, id: string, known: SubmissionState, sleep: Sleep): Promise<AbandonOutcome> {
  const state = await currentState(api, id, known);
  if (state === null) return 'nothing';
  if (DISCARDABLE_STATES.includes(state)) {
    await api.discard(id).catch(() => undefined);
    return 'discarded';
  }
  if (state === 'checking') {
    void discardAfterChecks(api, id, sleep);
    return 'after-checks';
  }
  return 'nothing';
}
