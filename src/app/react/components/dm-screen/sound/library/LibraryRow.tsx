import React, { memo, useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Square } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { HeldInMix } from '../../../../../soundDirector/libraryDesk';
import type { SoundConversion } from '../../../../../soundLibrary/soundConversion';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { cn } from '../../../../../../utils/cn';
import { folderTakes } from './libraryDrop';
import { FolderGlyph, PlayGlyph } from './libraryGlyphs';
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
  onOpen: (row: Row) => void;
  onPrimary: (row: Row) => void;
  onPreview: (row: Row) => void;
  onMenu: (row: Row, at: { x: number; y: number }, anchor: HTMLElement | null) => void;
  onDragStart: (row: Row, event: React.DragEvent) => void;
  onDropOnFolder: (row: Extract<Row, { type: 'folder' }>, event: React.DragEvent) => void;
  onRename: (row: Row, name: string | null) => void;
}

interface LibraryRowProps {
  row: Row;
  library: SoundLibrary;
  handlers: RowHandlers;
  selected: boolean;
  active: boolean;
  renaming: boolean;
  count: number | null;
  held: HeldInMix | undefined;
  previewing: boolean;
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
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
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
        if (event.key === 'Enter') onDone(value);
        if (event.key === 'Escape') onDone(null);
      }}
      onBlur={() => onDone(value)}
    />
  );
}

/** One row of the library: its controls take no focus, as the list holds it and the keys act on the row in view. */
export const LibraryRow = memo(function LibraryRow({ row, library, handlers, selected, active, renaming, count, held, previewing, conversion, style }: LibraryRowProps): React.JSX.Element {
  const state = row.type === 'waiting' ? t('audio.state.missing') : held ? t('audio.library.inMix') : conversion ? stateText(conversion) : '';
  const busy = conversion?.state === 'converting' || row.type === 'waiting';
  const [droppable, setDroppable] = useState(false);
  const primary = row.type !== 'file' ? null : held ? t('audio.library.remove') : row.file.kind === 'music' ? t('audio.library.playNext') : t('audio.library.add');

  return (
    <div
      id={`atlas-sound-row-${row.id}`}
      role="row"
      aria-selected={selected}
      className={cn('atlas-sound-lib__row', row.type === 'folder' && 'atlas-sound-lib__row--folder', held && 'atlas-sound-lib__row--mix', droppable && 'atlas-sound-lib__row--target', row.type === 'waiting' && 'atlas-sound-lib__row--waiting')}
      data-active={active || undefined}
      style={style}
      draggable={row.type !== 'waiting' && !renaming}
      onClick={(event) => handlers.onPress(row, event)}
      onDoubleClick={() => handlers.onOpen(row)}
      onContextMenu={(event) => {
        event.preventDefault();
        handlers.onMenu(row, { x: event.clientX, y: event.clientY }, null);
      }}
      onDragStart={(event) => handlers.onDragStart(row, event)}
      onDragOver={(event) => {
        if (row.type !== 'folder' || !folderTakes(event)) return;
        event.preventDefault();
        setDroppable(true);
      }}
      onDragLeave={() => setDroppable(false)}
      onDrop={(event) => {
        setDroppable(false);
        if (row.type === 'folder') handlers.onDropOnFolder(row, event);
      }}
    >
      <span role="gridcell">
        {row.type === 'file' && (
          <button type="button" tabIndex={-1} className="atlas-sound-lib__play" aria-label={previewing ? t('audio.stopPreview') : t('audio.previewSound', { name: row.name })} aria-pressed={previewing} onClick={(event) => { event.stopPropagation(); handlers.onPreview(row); }}>
            {previewing ? <Square aria-hidden="true" /> : <PlayGlyph />}
          </button>
        )}
      </span>
      <span role="gridcell" className="atlas-sound-lib__name">
        {row.type === 'folder' && <FolderGlyph />}
        {renaming ? <RenameField name={row.name} onDone={(name) => handlers.onRename(row, name)} /> : <span className="atlas-sound-lib__title">{row.name}</span>}
        {row.type === 'file' && row.where !== undefined && row.where !== '' && <span className="atlas-sound-lib__where">{row.where}</span>}
      </span>
      <span role="gridcell" className={cn('atlas-sound-lib__state', busy && 'atlas-sound-lib__state--busy')}>{state}</span>
      <span role="gridcell" className="atlas-sound-lib__length">
        {row.type === 'folder' && count !== null && count}
        {row.type === 'file' && <FileLength library={library} file={row.file} />}
      </span>
      <span role="gridcell">
        {primary !== null && (
          <button type="button" tabIndex={-1} className="atlas-sound-lib__act" onClick={(event) => { event.stopPropagation(); handlers.onPrimary(row); }}>{primary}</button>
        )}
      </span>
      <span role="gridcell">
        <button
          type="button"
          tabIndex={-1}
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

