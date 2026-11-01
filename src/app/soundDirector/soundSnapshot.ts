import type { SoundLifecycle } from '../sound/engine/soundWatchdog';
import type { LastMix, StoredOutput } from './deviceFacts';
import type { SoundMix } from './soundMix';

/** What the tab and the status bar draw. A new object whenever something in it changed. */
export interface SoundSnapshot {
  mix: SoundMix;
  lifecycle: SoundLifecycle;
  /** What a press brings back after a restart. */
  lastMix: LastMix | null;
  /** The record id being previewed. */
  previewing: string | null;
  output: StoredOutput | null;
  audience: string | null;
  /** Keys whose bytes a voice waits for. */
  waitingKeys: readonly string[];
  /** The records were read again, or copies changed. */
  shelfRevision: number;
  /** A table online told the Sound page something new. */
  playersRevision: number;
}
