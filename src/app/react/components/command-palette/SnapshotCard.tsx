import React, { useEffect, useRef } from 'react';
import { ImageOff } from 'lucide-react';
import type { SceneSnapshotEntry } from '../../../snapshots/SceneSnapshotService';
import { formatRelativeTime } from '../../../utils/relativeTime';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { getLocale, t } from '../../../i18n';

interface SnapshotCardProps {
  entry: SceneSnapshotEntry;
  thumbnailUrl: string | null;
  disabled: boolean;
  isRenaming: boolean;
  onRestore: (entry: SceneSnapshotEntry) => void;
  onStartRename: (entry: SceneSnapshotEntry) => void;
  /** The new name, or null when the rename was cancelled. */
  onFinishRename: (entry: SceneSnapshotEntry, name: string | null) => void;
  onContextMenu: (entry: SceneSnapshotEntry, event: React.MouseEvent) => void;
}

const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });

interface NameInputProps {
  name: string;
  onDone: (name: string | null) => void;
}

/** Renames in place like a file: Enter or clicking elsewhere keeps the name, Escape cancels. */
function NameInput({ name, onDone }: NameInputProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDone = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (value: string | null): void => {
    if (isDone.current) return;
    isDone.current = true;
    onDone(value);
  };

  return (
    <input
      ref={inputRef}
      className="atlas-snapshot-card__name-input"
      defaultValue={name}
      aria-label={t('snapshots.name')}
      spellCheck={false}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        // Keys belong to the input, not to the palette or the map behind it.
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(event.currentTarget.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      }}
    />
  );
}

/**
 * One snapshot as a 16:9 card showing when it was taken or last overwritten:
 * the image restores it, the name floating on it renames it, and right-click
 * offers those plus overwrite and delete.
 */
export function SnapshotCard({
  entry, thumbnailUrl, disabled, isRenaming, onRestore, onStartRename, onFinishRename, onContextMenu,
}: SnapshotCardProps): React.ReactElement {
  const { name, createdAt, updatedAt } = entry.snapshot;
  const takenAt = updatedAt ?? createdAt;

  return (
    <div
      className={cn('atlas-snapshot-card', isRenaming && 'atlas-snapshot-card--renaming')}
      role="group"
      aria-label={name}
      onContextMenu={(event) => onContextMenu(entry, event)}
    >
      <button
        type="button"
        className="atlas-snapshot-card__image"
        disabled={disabled}
        onClick={() => onRestore(entry)}
        aria-label={t('snapshots.restoreNamed', { name })}
      >
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" draggable={false} /> : <ImageOff />}
      </button>
      <div className="atlas-snapshot-card__caption">
        {isRenaming ? (
          <NameInput name={name} onDone={(value) => onFinishRename(entry, value)} />
        ) : (
          <button
            type="button"
            className="atlas-snapshot-card__name"
            disabled={disabled}
            onClick={() => onStartRename(entry)}
            aria-label={t('snapshots.renameNamed', { name })}
          >
            {name}
          </button>
        )}
        <LabelTooltip label={t(updatedAt ? 'snapshots.updatedAt' : 'snapshots.savedAt', { date: dateFormat.format(takenAt) })} describe>
          <span className="atlas-snapshot-card__date">{formatRelativeTime(takenAt)}</span>
        </LabelTooltip>
      </div>
    </div>
  );
}
