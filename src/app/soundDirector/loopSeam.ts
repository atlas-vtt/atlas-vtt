import { FRAMES_PER_MS } from '../sound/engine/soundMath';
import { frameInSpan, layerSpan, musicSpanAt, playFrameAt, type LoopRange, type TimelineSpan } from '../sound/engine/soundTimeline';
import type { LayerPlay, MusicPlay, TableSound } from '../sound/soundTypes';
import type { SoundMix } from './soundMix';
import { changed, leaving, OFFLINE_LEAD_MS, TRACK_JOIN_MS, withoutFinished } from './tableSound';

/**
 * Loop points the GM set on a track (`SoundRecord.loop`) are crossfaded where the loop goes round: as the play nears
 * its loop out, a play of the same sound that begins at its loop in comes up while the one before fades out, over the
 * crossfade the GM set for joins between tracks (never over half the loop, and never under a join's few milliseconds, so
 * no seam clicks). A track that goes round whole is crossfaded into its own start the same way, where the GM gave it a
 * crossfade of its own. It is what the GM's side writes ahead of each seam, as `applyDueListChange` writes a join; without
 * it the engine still goes round at the loop's frames, without a fade.
 */

export interface LoopSeamOptions {
  leadMs?: number;
  crossfadeMs?: number;
}

/**
 * The loop a span goes round with a seam: loop points the GM set on its sound, or the whole sound where the GM gave it a
 * crossfade of its own (a copy still growing has no end yet); null where it plays on to an end.
 */
function setLoopOf(span: TimelineSpan | null): LoopRange | null {
  if (!span || span.endPlayFrame !== null || span.loop === null) return null;
  // `loopRangeOf` hands a valid loop on as the object it is; anything else reads as the whole sound.
  if (span.loop === span.sound.loop) return span.loop;
  return (span.sound.crossfadeMs ?? 0) > 0 && !span.sound.growing ? span.loop : null;
}

/** How long a seam's crossfade lasts. */
export function seamFadeMs(loop: LoopRange, crossfadeMs: number): number {
  return Math.max(TRACK_JOIN_MS, Math.min(crossfadeMs, (loop.endFrame - loop.startFrame) / FRAMES_PER_MS / 2));
}

/** The seam a play reaches next: where its fade begins and how long it lasts; null where it has none, or it is further than `aheadMs`. */
function dueSeam(play: MusicPlay | LayerPlay, span: TimelineSpan | null, now: number, aheadMs: number, { leadMs = OFFLINE_LEAD_MS, crossfadeMs = 0 }: LoopSeamOptions): { at: number; ms: number; loop: LoopRange } | null {
  const loop = setLoopOf(span);
  // A play still coming in from its lead has no place in its loop yet.
  if (!span || !loop || play.startAt > now) return null;
  const frame = frameInSpan(span, playFrameAt(play.startAt, now));
  const outAt = now + (loop.endFrame - frame) / FRAMES_PER_MS;
  const fadeMs = seamFadeMs(loop, span.sound.crossfadeMs ?? crossfadeMs);
  if (outAt - fadeMs - now > aheadMs) return null;
  // A seam closer than the lead leaves less room than its fade asks for; with none left the engine's own wrap does it.
  const ms = Math.min(fadeMs, outAt - (now + leadMs));
  return ms < TRACK_JOIN_MS ? null : { at: outAt - ms, ms, loop };
}

/** The play that takes over at a seam: the same sound from its loop in, coming up over the seam's fade. */
function fromLoopIn<T extends MusicPlay | LayerPlay>(play: T, seam: { at: number; ms: number; loop: LoopRange }): T {
  return { ...play, startAt: seam.at, fromFrame: seam.loop.startFrame, fade: { at: seam.at, ms: seam.ms } };
}

/** Music and layers that near a seam of loop points the GM set, handed over ahead of it. */
export function applyDueLoopSeams(mix: SoundMix, now: number, aheadMs: number, options: LoopSeamOptions = {}): SoundMix {
  const { table } = mix;
  let next: TableSound = table;
  // A change of the list or a stop after this track takes over at its end, which a seam would only put off.
  const music = table.music;
  const musicSeam = music && mix.listChange === null && mix.stopAfter === null ? dueSeam(music, musicSpanAt(music, playFrameAt(music.startAt, now)), now, aheadMs, options) : null;
  if (music && musicSeam) {
    const live = withoutFinished(next, musicSeam.at);
    next = changed(live, { music: fromLoopIn(music, musicSeam), outgoing: [...live.outgoing, leaving(music, musicSeam.at, musicSeam.ms)] });
  }
  const leavingLayers: LayerPlay[] = [];
  const layers = next.layers.map((layer) => {
    const seam = dueSeam(layer, layerSpan(layer), now, aheadMs, options);
    if (!seam) return layer;
    leavingLayers.push(leaving(layer, seam.at, seam.ms));
    return fromLoopIn(layer, seam);
  });
  if (leavingLayers.length > 0) {
    const live = withoutFinished(next, now);
    next = changed(live, { layers, outgoingLayers: [...live.outgoingLayers, ...leavingLayers] });
  }
  return next === table ? mix : { ...mix, table: next };
}
