import type { Mood } from '../sound/soundTypes';
import type { LocalLevels } from '../sound/engine/mixerGraph';
import { CHANNEL_DB_RANGE } from '../services/soundSettings';
import { MOOD_LIMITS } from '../soundLibrary/moodFile';
import { shownMusic } from '../soundDirector/musicPause';
import type { SoundDirector } from '../soundDirector/SoundDirector';
import type { RemoteChannel, RemoteCommand, RemoteRepeat } from './remoteProtocol';
import type { TableCommand } from './remoteTable';

/** The part of the director a remote presses: the same intents the palette and the Sound page send. */
export type RemoteDirector = Pick<SoundDirector, 'isOn' | 'snapshot' | 'press' | 'pressNext' | 'setChannelLevels'> & {
  desk: Pick<SoundDirector['desk'], 'toggleSilence' | 'togglePause' | 'skip' | 'back' | 'setShuffle' | 'setRepeat' | 'setMusicMuted' | 'setMusicLevel'>;
};

/** Why a command did nothing. */
export type RemoteRefusal = 'sound-off' | 'no-mood' | 'no-music';

/** A dial sends a step per notch: the settings are written once it rests. */
const SAVE_AFTER_MS = 600;

const NEXT_REPEAT: Record<RemoteRepeat, 'one' | 'off' | undefined> = { all: 'one', one: 'off', off: undefined };

const LEVEL_KEYS: Record<Exclude<RemoteChannel, 'musicStrip'>, keyof LocalLevels> = { master: 'masterDb', music: 'musicDb', ambience: 'ambienceDb' };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function target(command: Extract<RemoteCommand, { type: 'level' }>, current: number): number {
  if (command.reset) return 0;
  return command.db ?? current + (command.deltaDb ?? 0);
}

/** Runs remote commands on the director, and writes this device's levels after the last turn of a dial. */
export class RemoteCommands {
  private saveTimer = 0;

  constructor(private readonly director: RemoteDirector, private readonly moodOf: (id: string) => Mood | null) {}

  /** Null where it was done. */
  run(command: Exclude<RemoteCommand, TableCommand>): RemoteRefusal | null {
    const { director } = this;
    if (!director.isOn) return 'sound-off';
    const { desk } = director;
    const music = shownMusic(director.snapshot().mix);
    const list = director.snapshot().mix.listChange ?? music;
    switch (command.type) {
      case 'mood': {
        const mood = this.moodOf(command.id);
        if (!mood) return 'no-mood';
        director.press(mood);
        return null;
      }
      case 'nextMood': director.pressNext(); return null;
      case 'stopAll': desk.toggleSilence(); return null;
      case 'pause': desk.togglePause(); return null;
      case 'nextTrack': desk.skip(); return null;
      case 'previousTrack': desk.back(); return null;
      case 'shuffle':
        if (!list) return 'no-music';
        desk.setShuffle(!list.shuffle);
        return null;
      case 'repeat':
        if (!list) return 'no-music';
        desk.setRepeat(NEXT_REPEAT[list.repeat ?? 'all']);
        return null;
      case 'muteMusic':
        if (!music) return 'no-music';
        desk.setMusicMuted(music.muted !== true);
        return null;
      case 'level':
        return this.level(command, music?.gainDb ?? null);
    }
  }

  dispose(): void {
    if (this.saveTimer) this.saveLevels();
  }

  private level(command: Extract<RemoteCommand, { type: 'level' }>, stripDb: number | null): RemoteRefusal | null {
    if (command.channel === 'musicStrip') {
      if (stripDb === null) return 'no-music';
      this.director.desk.setMusicLevel(clamp(target(command, stripDb), MOOD_LIMITS.minLevelDb, MOOD_LIMITS.maxLevelDb));
      return null;
    }
    const key = LEVEL_KEYS[command.channel];
    const db = clamp(target(command, this.director.snapshot().levels[key]), CHANNEL_DB_RANGE.min, CHANNEL_DB_RANGE.max);
    this.director.setChannelLevels({ [key]: db }, false);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveLevels(), SAVE_AFTER_MS);
    return null;
  }

  private saveLevels(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    this.director.setChannelLevels({}, true);
  }
}
