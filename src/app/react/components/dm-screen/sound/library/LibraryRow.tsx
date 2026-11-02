import React, { memo, useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Square } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { HeldInMix } from '../../../../../soundDirector/libraryDesk';
import type { SoundConversion } from '../../../../../soundLibrary/soundConversion';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { cn } from '../../../../../../utils/cn';
import { PlayGlyph } from './libraryGlyphs';
import { formatLength, type LibraryRow as Row } from './rowModel';
import { useFileSeconds } from './useLibrary';

/** What the state column says of a file on this device. */
function stateText(conversion: SoundConversion): string {
  switch (conversion.state) {
    case 'converting': return conversion.progress === null ? t('audio.state.converting') : t('audio.state.convertingPercent', { percent: Math.round(conversion.progress * 100) });
    case 'refused': return t(`audio.refused.${conversion.reason}`);
    default: return '';
  }
}

export interface RowHandlers {
  onPress: (row: Row, event: React.MouseEvent) => void;
  onPrimary: (row: Row) => void;
  onPlay: (row: Row) => void;
  onPreview: (row: Row) => void;
  onMenu: (row: Row, at: { x: number; y: number }, anchor: HTMLElement | null) => void;
  onDragStart: (row: Row, event: React.DragEvent) => void;
  onRename: (row: Row, name: string | null) => void;
}

interface LibraryRowProps {
  row: Row;
  library: SoundLibrary;
  handlers: RowHandlers;
  selected: boolean;
  active: boolean;
  renaming: boolean;
  held: HeldInMix | undefined;
  previewing: boolean;
  /** Plays now: of a list only its one track, and ambience all it holds. */
  sounding: boolean;
  conversion: SoundConversion | null;
  style: React.CSSProperties;
}

function FileLength({ library, file }: { library: SoundLibrary; file: LibraryFile }): React.JSX.Element {
  const seconds = useFileSeconds(library, () => library.secondsOf(file));
  return <>{typeof seconds === 'number' ? formatLength(seconds) : ''}</>;
}

function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }): React.JSX.Element {
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  const ended = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // Whoever ends it takes focus from the field, whose blur then runs inside that same call.
  const end = (result: string | null): void => {
    if (ended.current) return;
    ended.current = true;
    onDone(result);
  };
  return (
    <input
      ref={ref}
      className="atlas-sound-lib__rename"
      aria-label={t('audio.library.rename')}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') end(value);
        if (event.key === 'Escape') end(null);
      }}
      onBlur={() => end(value)}
    />
  );
}

/** One row of the library: its controls take no focus, as the list holds it and the keys act on the row in view. */
export const LibraryRow = memo(function LibraryRow({ row, library, handlers, selected, active, renaming, held, previewing, sounding, conversion, style }: LibraryRowProps): React.JSX.Element {
  const state = row.type === 'waiting' ? t('audio.state.missing') : sounding ? t('audio.playingTag') : held?.key ? t('audio.library.inMix') : conversion ? stateText(conversion) : held ? t('audio.library.inMix') : '';
  const busy = conversion?.state === 'converting' || row.type === 'waiting';
  const showsStop = previewing || sounding;
  const playLabel = previewing ? t('audio.stopPreview') : sounding ? t('audio.remove', { name: row.name }) : t('audio.playTrack', { name: row.name });

  return (
    <div
      id={`atlas-sound-row-${row.id}`}
      role="row"
      aria-selected={selected}
      className={cn('atlas-sound-lib__row', held && 'atlas-sound-lib__row--mix', row.type === 'waiting' && 'atlas-sound-lib__row--waiting')}
      data-active={active || undefined}
      style={style}
      draggable={row.type !== 'waiting' && !renaming}
      onClick={(event) => handlers.onPress(row, event)}
      onDoubleClick={() => handlers.onPrimary(row)}
      onContextMenu={(event) => {
        event.preventDefault();
        handlers.onMenu(row, { x: event.clientX, y: event.clientY }, null);
      }}
      onDragStart={(event) => handlers.onDragStart(row, event)}
    >
      <span role="gridcell">
        {row.type === 'file' && (
          <button type="button" tabIndex={-1} data-focus-skip className="atlas-sound-lib__play" aria-label={playLabel} aria-pressed={showsStop} onClick={(event) => { event.stopPropagation(); if (previewing) handlers.onPreview(row); else handlers.onPlay(row); }}>
            {showsStop ? <Square aria-hidden="true" /> : <PlayGlyph />}
          </button>
        )}
      </span>
      <span role="gridcell" className="atlas-sound-lib__name">
        {renaming ? <RenameField name={row.name} onDone={(name) => handlers.onRename(row, name)} /> : <span className="atlas-sound-lib__title">{row.name}</span>}
        {row.where !== '' && <span className="atlas-sound-lib__where">{row.where}</span>}
      </span>
      <span role="gridcell" className={cn('atlas-sound-lib__state', busy && 'atlas-sound-lib__state--busy')}>{state}</span>
      <span role="gridcell" className="atlas-sound-lib__length">
        {row.type === 'file' && <FileLength library={library} file={row.file} />}
      </span>
      <span role="gridcell">
        {row.type === 'file' && row.file.kind === 'music' && !held && (
          <button type="button" tabIndex={-1} data-focus-skip className="atlas-sound-lib__act" onClick={(event) => { event.stopPropagation(); handlers.onPrimary(row); }}>{t('audio.library.playNext')}</button>
        )}
      </span>
      <span role="gridcell">
        <button
          type="button"
          tabIndex={-1}
          data-focus-skip
          className="atlas-sound-lib__more"
          aria-label={t('audio.moodMenu', { name: row.name })}
          onClick={(event) => {
            event.stopPropagation();
            const box = event.currentTarget.getBoundingClientRect();
            handlers.onMenu(row, { x: box.left, y: box.bottom }, event.currentTarget);
          }}
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
      </span>
    </div>
  );
});

