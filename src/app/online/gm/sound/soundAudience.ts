import type { PlayerSoundState } from '../../protocol/index.ts';
import { t } from '../../../i18n';
import type { AudienceLine } from '../../../soundDirector/tableClock';
import { audienceDetail, playerHearing } from './audienceDetail.ts';

const SEPARATOR = ' · ';

export interface AudienceFacts {
  /** The players at the table now. */
  connected(): readonly string[];
  /** How many sounds the state in play names; 0 while nothing plays. */
  soundsPlaying(): number;
  /** How many sounds players were handed that are still on their way. */
  uploading(): number;
  /** Stop all holds the table: nobody hears it until Bring back. */
  stopped(): boolean;
  /** A player's name at the table; null where it has none yet. */
  nameOf(player: string): string | null;
}

/**
 * Who hears the table, in one line: as far as each page says, since only the page can tell. A page
 * waiting for every sound of the state hears nothing yet, whatever its context does.
 */
export class SoundAudience implements AudienceLine {
  private readonly pages = new Map<string, PlayerSoundState>();
  private readonly listeners = new Set<() => void>();

  /**
   * `heard`: what pages told this device before it was reloaded. A page tells only what changed, so a GM back
   * from a reload would otherwise hear nobody until something changed there. `noted` keeps what pages tell.
   */
  constructor(private readonly facts: AudienceFacts, heard: Iterable<readonly [string, PlayerSoundState]> = [], private readonly noted?: (pages: ReadonlyMap<string, PlayerSoundState>) => void) {
    for (const [player, state] of heard) this.pages.set(player, state);
  }

  take(player: string, state: PlayerSoundState): void {
    this.pages.set(player, state);
    this.noted?.(this.pages);
    this.changed();
  }

  left(player: string): void {
    this.pages.delete(player);
    this.noted?.(this.pages);
    this.changed();
  }

  /** Keeps what pages told as it is now, as this device lets go of the table (a reload is about to come). */
  keep(): void {
    this.noted?.(this.pages);
  }

  line(): string | null {
    const players = this.facts.connected();
    const sounds = this.facts.soundsPlaying();
    const uploading = this.facts.uploading();
    // Stopped, nobody hears: the line says so rather than count pages that still play silence.
    const who = this.facts.stopped()
      ? t('audio.players.stopped', { count: players.length })
      : t('audio.players.hearing', { hearing: players.filter((player) => this.hears(player, sounds)).length, total: players.length, count: players.length });
    const parts = [
      ...((sounds > 0 || this.facts.stopped()) && players.length > 0 ? [who] : []),
      ...(uploading > 0 ? [t('audio.players.uploading', { count: uploading })] : []),
    ];
    return parts.length > 0 ? parts.join(SEPARATOR) : null;
  }

  detail(): string | null {
    const sounds = this.facts.soundsPlaying();
    const players = this.facts.connected().map((player) => ({ name: this.facts.nameOf(player) ?? t('audio.players.unnamed'), hearing: playerHearing(this.pages.get(player), sounds) }));
    return audienceDetail(players, sounds > 0 && !this.facts.stopped());
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private hears(player: string, sounds: number): boolean {
    return playerHearing(this.pages.get(player), sounds) === 'hears';
  }
}
