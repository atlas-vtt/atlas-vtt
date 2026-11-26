/** Where a job comes from: the plugin's own packs, or the store later. Read only to tell jobs apart; never shown. */
export type DownloadOrigin = 'music-pack' | 'starter-ambience' | 'armarium';

export type DownloadState = 'queued' | 'downloading' | 'done' | 'failed' | 'cancelled';

export interface DownloadAmount {
  bytes: number;
  files: number;
}

/**
 * What a running job tells the manager. Bytes come a whole file at a time, so a task reports files: a file it
 * fetched now counts towards the speed, one that was there already only towards the share done.
 */
export interface DownloadProgress {
  /** Aborted once the job is cancelled: start no new file, write nothing still in flight, keep what is whole. */
  readonly signal: AbortSignal;
  /** All the job moves, files already there included, once the task knows it. */
  expect(total: DownloadAmount): void;
  /** One file is whole: `fetched` when its bytes came over the network for this run. */
  fileDone(bytes: number, fetched: boolean): void;
}

/** A job as the caller describes it. The manager runs `run` once per start, so Retry starts it again. */
export interface DownloadTask {
  /** One job per id: asking for an id that is queued or downloading gets the job there. */
  id: string;
  title: string;
  origin: DownloadOrigin;
  /** What it will move, shown while it waits; `expect` replaces it once it runs. */
  estimate: DownloadAmount;
  run: (progress: DownloadProgress) => Promise<void>;
  /** After a whole run, once. */
  onDone?: () => void;
  /** Shows what the job brought where it lives; offered once it is done. */
  reveal?: () => void;
  /** A few words on why a run failed. */
  explain?: (error: unknown) => string;
}

/** A job as the interface shows it: a new object whenever the manager announces a change. */
export interface DownloadJob {
  id: string;
  title: string;
  origin: DownloadOrigin;
  state: DownloadState;
  done: DownloadAmount;
  total: DownloadAmount;
  /** Bytes a second while it downloads; null before the meter can tell. */
  speed: number | null;
  secondsLeft: number | null;
  /** Why it failed, in a few words; null unless it did. */
  failure: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  canReveal: boolean;
}

/** Whether a job still has work ahead of it. */
export const isActive = (job: Pick<DownloadJob, 'state'>): boolean => job.state === 'queued' || job.state === 'downloading';
