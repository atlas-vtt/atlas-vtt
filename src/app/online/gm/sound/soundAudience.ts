import type { PlayerSoundState } from '../../protocol/index.ts';
import { t } from '../../../i18n';
import type { AudienceLine } from '../../../soundDirector/tableClock';

const SEPARATOR = ' · ';

export interface AudienceFacts {
  /** The players at the table now. */
  connected(): readonly string[];
  /** How many sounds the state in play names; 0 while nothing plays. */
  soundsPlaying(): number;
  /** How many sounds players were handed that are still on their way. */
  uploading(): number;
}

/**
 * Who hears the table, in one line: as far as each page says, since only the page can tell. A page
 * waiting for every sound of the state hears nothing yet, whatever its context does.
 */
export class SoundAudience implements AudienceLine {
  private readonly pages = new Map<string, PlayerSoundState>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly facts: AudienceFacts) {}

  take(player: string, state: PlayerSoundState): void {
    this.pages.set(player, state);
    this.changed();
  }

  left(player: string): void {
    this.pages.delete(player);
    this.changed();
  }

  line(): string | null {
    const players = this.facts.connected();
    const sounds = this.facts.soundsPlaying();
    const uploading = this.facts.uploading();
    const parts = [
      ...(sounds > 0 && players.length > 0 ? [t('audio.players.hearing', { hearing: players.filter((player) => this.hears(player, sounds)).length, total: players.length })] : []),
      ...(uploading > 0 ? [t('audio.players.uploading', { count: uploading })] : []),
    ];
    return parts.length > 0 ? parts.join(SEPARATOR) : null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private hears(player: string, sounds: number): boolean {
    const page = this.pages.get(player);
    return page?.state === 'playing' && page.waiting.length < sounds;
  }
}
