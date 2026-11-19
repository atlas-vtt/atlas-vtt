import { t } from '../../../../i18n';
import { FRAMES_PER_MS } from '../../../../sound/engine/soundMath';
import type { SoundRecord } from '../../../../sound/soundTypes';
import { seamFadeMs } from '../../../../soundDirector/loopSeam';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { loopClock, withLoopIn, withLoopOut, type LoopPoints } from '../../../../soundLibrary/loopPoints';
import type { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../context-menu/AtlasContextMenu';

/** How long before a seam's fade "Hear the seam" sets the track playing. */
const SEAM_LEAD_MS = 3000;

/** Loop points stored on a record; none clears them. */
export function saveLoop(records: SoundRecordStore, record: SoundRecord, loop: LoopPoints | null): void {
  records.update([record.id], { loop: loop ?? undefined });
}

/**
 * The menu of the desk's waveform: loop points at the place pressed, of the track that plays, and a seek to just
 * before its seam, so the GM hears how it goes round.
 */
export function loopMenu(director: SoundDirector, records: SoundRecordStore, record: SoundRecord, frame: number, frames: number): ContextMenuEntry[] {
  const loop = record.loop;
  const set = (next: LoopPoints | null): void => {
    if (next) saveLoop(records, record, next);
  };
  const inAt = withLoopIn(loop, frame, frames);
  const outAt = withLoopOut(loop, frame, frames);
  return [
    { type: 'item', label: t('audio.loopInHere', { at: loopClock(frame) }), icon: 'chevron-first', disabled: inAt === null, onClick: () => set(inAt) },
    { type: 'item', label: t('audio.loopOutHere', { at: loopClock(frame) }), icon: 'chevron-last', disabled: outAt === null, onClick: () => set(outAt) },
    MENU_SEPARATOR,
    {
      type: 'item',
      label: t('audio.hearSeam'),
      icon: 'repeat',
      disabled: !loop,
      onClick: () => {
        if (!loop) return;
        const fadeMs = record.crossfadeSeconds === undefined ? director.crossfadeMs() : record.crossfadeSeconds * 1000;
        const before = (seamFadeMs(loop, fadeMs) + SEAM_LEAD_MS) * FRAMES_PER_MS;
        director.desk.seekMusic(Math.max(loop.startFrame, loop.endFrame - before));
      },
    },
    { type: 'item', label: t('audio.startAtLoopIn'), checked: record.startAtLoopIn === true, disabled: !loop, onClick: () => records.update([record.id], { startAtLoopIn: record.startAtLoopIn ? undefined : true }) },
    { type: 'item', label: t('audio.clearLoop'), icon: 'x', disabled: !loop, onClick: () => saveLoop(records, record, null) },
  ];
}
