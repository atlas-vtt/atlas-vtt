import type { LocalLevels } from '../sound/engine/mixerGraph';
import type { SoundLifecycle } from '../sound/engine/soundWatchdog';
import type { LastMix, StoredOutput } from './deviceFacts';
import type { SoundMix } from './soundMix';

/** What the tab and the status bar draw. A new object whenever something in it changed. */
export interface SoundSnapshot {
  mix: SoundMix;
  /** This table's own levels, which the settings hold. */
  levels: LocalLevels;
  lifecycle: SoundLifecycle;
  /** What a press brings back after a restart. */
  lastMix: LastMix | null;
  /** The record id being previewed. */
  previewing: string | null;
  output: StoredOutput | null;
  audience: string | null;
  /** Who hears it, player by player, for the audience line's tooltip. */
  audienceDetail: string | null;
  /** Keys whose bytes a voice waits for. */
  waitingKeys: readonly string[];
  /** Keys of what played this session, the latest first. In memory on this side alone. */
  played: readonly string[];
  /** The records were read again, or copies changed. */
  shelfRevision: number;
  /** A table online told the Sound page something new. */
  playersRevision: number;
}
