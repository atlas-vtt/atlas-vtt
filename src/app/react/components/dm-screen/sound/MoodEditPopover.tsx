import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../../../i18n';
import { Button } from '../../../../packages/components/primitives/button';
import { SegmentedControl } from '../../../../packages/components/primitives/SegmentedControl';
import { useDialogEscape } from '../../../../packages/components/primitives/useDialogEscape';
import { DEFAULT_ROOM, ROOM_IDS, type Mood, type RoomId } from '../../../../sound/soundTypes';
import { roomName } from './useRoomName';
import { MoodLookPicker } from './MoodLookPicker';
import { placeUnderTile, type PopoverPlace } from './moodPopoverPlacement';
import { portalHost } from '../../../../host/portalHost';

type MusicChoice = 'list' | 'keep' | 'none';

interface MoodEditPopoverProps {
  mood: Mood;
  /** The mood's tile, which the popover hangs from. */
  anchor: HTMLElement;
  onClose: () => void;
  onSave: (mood: Mood) => void;
}

const ROOM_OPTIONS = ROOM_IDS.map((id) => ({ value: id, label: roomName(id) }));

const MUSIC_OPTIONS = [
  { value: 'list', label: t('audio.mood.musicList') },
  { value: 'keep', label: t('audio.mood.musicKeep') },
  { value: 'none', label: t('audio.mood.musicNone') },
] as const;

/** Keeps the popover at its tile while the page scrolls or the window changes size, and closes it on a press elsewhere. */
function usePlaceAtTile(ref: React.RefObject<HTMLDivElement | null>, anchor: HTMLElement, onClose: () => void): PopoverPlace | null {
  const [place, setPlace] = useState<PopoverPlace | null>(null);
  useLayoutEffect(() => {
    const doc = anchor.ownerDocument;
    const win = doc.defaultView ?? window;
    const measure = (): void => {
      const box = ref.current;
      if (!box) return;
      const tile = anchor.getBoundingClientRect();
      setPlace(placeUnderTile(tile, { width: box.offsetWidth, height: box.offsetHeight }, { width: win.innerWidth, height: win.innerHeight }));
    };
    const press = (event: Event): void => {
      const target = event.target as Node | null;
      if (target && (ref.current?.contains(target) || anchor.contains(target))) return;
      onClose();
    };
    measure();
    win.addEventListener('resize', measure);
    doc.addEventListener('scroll', measure, true);
    doc.addEventListener('pointerdown', press, true);
    return () => {
      win.removeEventListener('resize', measure);
      doc.removeEventListener('scroll', measure, true);
      doc.removeEventListener('pointerdown', press, true);
    };
  }, [anchor, onClose, ref]);
  return place;
}

/**
 * A mood's own facts, in a popover under its tile: name, tone, crest and what its music does. What
 * sounds in it is made on the desk and saved from there; every mood fades by the one Fade setting.
 */
export function MoodEditPopover({ mood, anchor, onClose, onSave }: MoodEditPopoverProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(mood.name);
  const hasList = typeof mood.music === 'object';
  const [music, setMusic] = useState<MusicChoice>(typeof mood.music === 'object' ? 'list' : mood.music);
  const [room, setRoom] = useState<RoomId>(mood.room ?? DEFAULT_ROOM);
  const [look, setLook] = useState<Pick<Mood, 'icon' | 'tone'>>({ ...(mood.icon && { icon: mood.icon }), ...(mood.tone && { tone: mood.tone }) });
  useDialogEscape(ref, onClose);
  const place = usePlaceAtTile(ref, anchor, onClose);

  const save = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const listened = music === 'list' && typeof mood.music === 'object' ? mood.music : music === 'keep' ? 'keep' : 'none';
    onSave({ ...mood, ...look, name: trimmed, music: listened, room });
    onClose();
  };

  return createPortal(
    <div className="atlas-vtt-plugin atlas-sound-popover-layer">
      <div
        ref={ref}
        className="atlas-sound-popover"
        role="dialog"
        aria-label={t('audio.mood.editTitle')}
        data-side={place?.side}
        style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? undefined : 'hidden', '--atlas-sound-caret': `${place?.caret ?? 0}px` } as React.CSSProperties}
      >
        <span className="atlas-sound-popover__caret" aria-hidden="true" />
        <input
          type="text"
          className="atlas-sound-popover__name"
          aria-label={t('audio.mood.name')}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
        />
        <MoodLookPicker look={look} onChange={setLook} />
        <div className="atlas-sound-field">
          <span>{t('audio.room.label')}</span>
          <SegmentedControl value={room} options={ROOM_OPTIONS} onChange={setRoom} ariaLabel={t('audio.room.label')} />
        </div>
        <div className="atlas-sound-field">
          <span>{t('audio.mood.music')}</span>
          <SegmentedControl value={music} options={hasList ? MUSIC_OPTIONS : MUSIC_OPTIONS.slice(1)} onChange={setMusic} ariaLabel={t('audio.mood.music')} />
        </div>
        <Button type="button" className="atlas-sound-popover__save" onClick={save} disabled={name.trim() === ''}>{t('common.save')}</Button>
      </div>
    </div>,
    portalHost(anchor.ownerDocument),
  );
}
