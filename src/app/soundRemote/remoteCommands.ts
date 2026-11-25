import type { Mood } from '../sound/soundTypes';
import { shownMusic } from '../soundDirector/musicPause';
import type { SoundDirector } from '../soundDirector/SoundDirector';
import { ambienceLevel, clampDb, layersShiftedTo, musicLevel } from './remoteLevels';
import type { RemoteCommand, RemoteRepeat } from './remoteProtocol';
import type { TableCommand } from './remoteTable';

/** The part of the director a remote presses: the same intents the palette and the Sound page send. */
export type RemoteDirector = Pick<SoundDirector, 'isOn' | 'snapshot' | 'press' | 'pressNext' | 'setChannelLevels'> & {
  desk: Pick<SoundDirector['desk'], 'toggleSilence' | 'togglePause' | 'skip' | 'back' | 'setShuffle' | 'setRepeat' | 'setMusicMuted' | 'setMusicLevel' | 'setLayerLevels'>;
};

/** Why a command did nothing. */
export type RemoteRefusal = 'sound-off' | 'no-mood' | 'no-music' | 'no-ambience';

/** A dial sends a step per notch: Master's setting is written once it rests. */
const SAVE_AFTER_MS = 600;

const NEXT_REPEAT: Record<RemoteRepeat, 'one' | 'off' | undefined> = { all: 'one', one: 'off', off: undefined };

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
        return this.level(command);
    }
  }

  dispose(): void {
    if (this.saveTimer) this.saveLevels();
  }

  /**
   * Music and Ambience move the Sound page's faders, which players hear too (`musicStrip`, an older controller's
   * "Music in mix", is Music); Master is this device's level. This device's music and ambience levels stay in Settings.
   */
  private level(command: Extract<RemoteCommand, { type: 'level' }>): RemoteRefusal | null {
    const { director } = this;
    const { mix } = director.snapshot();
    switch (command.channel) {
      case 'music':
      case 'musicStrip': {
        const db = musicLevel(mix);
        if (db === null) return 'no-music';
        director.desk.setMusicLevel(clampDb(target(command, db)));
        return null;
      }
      case 'ambience': {
        const db = ambienceLevel(mix);
        if (db === null) return 'no-ambience';
        director.desk.setLayerLevels(layersShiftedTo(mix, target(command, db)));
        return null;
      }
      case 'master':
        director.setChannelLevels({ masterDb: clampDb(target(command, director.snapshot().levels.masterDb)) }, false);
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.saveLevels(), SAVE_AFTER_MS);
        return null;
    }
  }

  private saveLevels(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    this.director.setChannelLevels({}, true);
  }
}
