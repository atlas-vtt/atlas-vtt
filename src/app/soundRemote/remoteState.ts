import type { Mood } from '../sound/soundTypes';
import { moodCrestPath, moodIcon, moodTone } from '../soundLibrary/moodLook';
import { MOOD_LIMITS } from '../soundLibrary/moodFile';
import { CHANNEL_DB_RANGE } from '../services/soundSettings';
import { soundingTrack } from '../soundDirector/musicList';
import { shownMusic } from '../soundDirector/musicPause';
import type { SoundShelf } from '../soundDirector/soundShelf';
import type { SoundSnapshot } from '../soundDirector/soundSnapshot';
import { isPlaying } from '../soundDirector/tableSound';
import { whatPlays } from '../soundDirector/whatPlays';
import type { RemoteMood, RemoteMusic, RemoteState } from './remoteProtocol';
import { remoteRolls } from './remoteRolls';
import { remoteCombat, remotePlayer, savedRollsOnMap, type TableSource } from './remoteTable';

/** What the remote reads of the director: its snapshot, its clock and the names of what plays. */
export interface RemoteSource {
  isOn: boolean;
  snapshot(): SoundSnapshot;
  now(): number;
  shelf: Pick<SoundShelf, 'recordOfKey'>;
}

export function remoteMoods(moods: readonly Mood[]): RemoteMood[] {
  return moods.map((mood) => ({ id: mood.id, name: mood.name, tone: moodTone(mood), crest: moodCrestPath(moodIcon(mood)) }));
}

/** The music as the Sound page's music card shows it: what plays, else what is paused. */
function remoteMusic(source: RemoteSource): RemoteMusic | null {
  const { mix } = source.snapshot();
  const play = shownMusic(mix);
  if (!play) return null;
  const list = mix.listChange ?? play;
  const track = mix.table.music ? soundingTrack(mix.table, source.now()) : null;
  return {
    paused: mix.paused !== undefined && mix.paused.byStop !== true,
    muted: play.muted === true,
    shuffle: list.shuffle,
    repeat: list.repeat ?? 'all',
    levelDb: play.gainDb,
    track: track ? (source.shelf.recordOfKey(track.key)?.name ?? null) : null,
  };
}

export function remoteState(source: RemoteSource, moodOf: (id: string) => Mood | null, table: TableSource): RemoteState {
  const { mix, levels } = source.snapshot();
  const now = source.now();
  const mood = mix.mood ? moodOf(mix.mood.id) : null;
  // Music held by Stop all still names what Bring back brings back, as the status bar does.
  const held = mix.table.silenced && mix.paused ? { ...mix.table, music: mix.paused.play } : mix.table;
  const named = (held.music || held.layers.length > 0) && isPlaying(held, now);
  return {
    soundOn: source.isOn,
    mood: mood?.id ?? null,
    playing: source.isOn && !mix.table.silenced && isPlaying(mix.table, now),
    stopped: source.isOn && mix.table.silenced,
    music: source.isOn ? remoteMusic(source) : null,
    nowPlaying: source.isOn && named ? whatPlays(held, mood, source.shelf, now) : null,
    levels: { masterDb: levels.masterDb, musicDb: levels.musicDb, ambienceDb: levels.ambienceDb },
    ranges: { channel: [CHANNEL_DB_RANGE.min, CHANNEL_DB_RANGE.max], strip: [MOOD_LIMITS.minLevelDb, MOOD_LIMITS.maxLevelDb] },
    combat: remoteCombat(table),
    player: remotePlayer(table),
    rolls: remoteRolls(savedRollsOnMap(table)),
    rollsShown: table.shareRolls.shown(),
  };
}
