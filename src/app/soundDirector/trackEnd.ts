import { musicSpanAt, playFrameAt } from '../sound/engine/soundTimeline';
import { stopMusic } from './liveEdits';
import { joinFadeMs, placeAfter, playAtPlace } from './listPlace';
import { handOver, musicPosition, withListChange } from './musicList';
import type { SoundMix } from './soundMix';
import { changed, OFFLINE_LEAD_MS, STOP_AFTER_FADE_MS, TRACK_JOIN_MS, withoutFinished } from './tableSound';

export interface TrackEndOptions {
  leadMs?: number;
  /** How long tracks of a list overlap; 0 leaves them to the state's own gapless timeline. */
  crossfadeMs?: number;
}

/** The music is over, with nothing left to join it: what a Stop leaves, but for the layers and the mood. */
function musicEnded(mix: SoundMix, table: SoundMix['table']): SoundMix {
  const { soonest: _dropped, ...rest } = mix;
  return { ...rest, table, waitingMusic: null, listChange: null, stopAfter: null };
}

/**
 * What the GM's side does as a track's end draws near. Everything here is written ahead of that end, close enough for a slider to go on
 * working until then: a waiting change of the list, a stop after this track, and a crossfade, which is what comes starting `crossfadeMs`
 * before the end while what ends leaves. Without the GM the state's own timeline goes on and joins its tracks without a gap.
 */
export function applyDueListChange(mix: SoundMix, now: number, aheadMs: number, { leadMs = OFFLINE_LEAD_MS, crossfadeMs = 0 }: TrackEndOptions = {}): SoundMix {
  const { table, listChange } = mix;
  const play = table.music;
  if (!play) return listChange || mix.stopAfter !== null ? { ...mix, listChange: null, stopAfter: null } : mix;
  const position = musicPosition(play, now);
  // A list that stops at its end has reached it: a page given this state is silent by now.
  if (!position) return musicEnded(mix, changed(withoutFinished(table, now), { music: null }));
  const at = position.endsAt;
  if (mix.stopAfter !== null) {
    const startAt = Math.min(at - TRACK_JOIN_MS, Math.max(at - STOP_AFTER_FADE_MS, now + leadMs));
    // Just ahead of its fade: the card leaves with it.
    return startAt - now > leadMs * 2 ? mix : musicEnded(mix, stopMusic(table, startAt, at - startAt));
  }
  if (!listChange && (crossfadeMs === 0 || position.next === null)) return mix;
  const span = musicSpanAt(play, playFrameAt(play.startAt, at - 1));
  if (!span) return mix;
  const listPlace = placeAfter(play, listChange, span);
  const coming = listPlace && musicPosition(playAtPlace(play, listPlace, at, 0), at)?.track;
  const fadeMs = Math.max(TRACK_JOIN_MS, coming ? joinFadeMs(span.sound, coming, crossfadeMs) : 0);
  if (at - fadeMs - now > aheadMs) return mix;
  if (listChange && !listPlace) return musicEnded(mix, withListChange(table, listChange, at));
  // A seek into the last moments leaves less room than the fade asks for; with none left the state's own join does it.
  const roomMs = at - (now + leadMs);
  const overlapMs = Math.min(fadeMs, roomMs);
  if (listChange) return { ...mix, table: withListChange(table, listChange, at, Math.max(TRACK_JOIN_MS, overlapMs)), listChange: null };
  if (!listPlace || overlapMs < TRACK_JOIN_MS) return mix;
  return { ...mix, table: handOver(table, play, listPlace, at - overlapMs, overlapMs) };
}
