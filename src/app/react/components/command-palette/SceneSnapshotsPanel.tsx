import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { openContextMenuGlobal } from '../../root/ContextMenuContext';
import type { SceneSnapshotEntry } from '../../../snapshots/SceneSnapshotService';
import { SnapshotCard } from './SnapshotCard';
import { useSceneSnapshots } from './useSceneSnapshots';
import { t } from '../../../i18n';

interface SceneSnapshotsPanelProps {
  /** Called right before a snapshot replaces the map, so the palette can close. */
  onRestore: () => void;
}

/**
 * The command palette page for the open scene's snapshots: a tile that saves
 * one under a default name, then the snapshots newest first.
 */
export function SceneSnapshotsPanel({ onRestore }: SceneSnapshotsPanelProps): React.ReactElement {
  const { entries, isLoading, isBusy, thumbnailUrl, save, restore, overwrite, rename, remove, copyLink } = useSceneSnapshots(onRestore);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const finishRename = useCallback((entry: SceneSnapshotEntry, name: string | null): void => {
    setRenamingId(null);
    if (name !== null) void rename(entry, name);
  }, [rename]);

  const openMenu = useCallback((entry: SceneSnapshotEntry, event: React.MouseEvent): void => {
    event.preventDefault();
    openContextMenuGlobal([
      { type: 'item', label: t('common.restore'), icon: 'history', onClick: () => restore(entry) },
      { type: 'item', label: t('snapshots.overwriteWithCurrent'), icon: 'refresh-cw', onClick: () => overwrite(entry) },
      { type: 'item', label: t('common.rename'), icon: 'pencil', onClick: () => setRenamingId(entry.snapshot.id) },
      { type: 'item', label: t('atlasLinks.copyLink'), icon: 'link', onClick: () => copyLink(entry) },
      { type: 'item', label: t('common.delete'), icon: 'trash-2', destructive: true, onClick: () => remove(entry) },
    ], { x: event.clientX, y: event.clientY });
  }, [copyLink, overwrite, remove, restore]);

  return (
    <div className="atlas-snapshots">
      <div className="atlas-snapshots-grid">
        <button type="button" className="atlas-snapshot-new" disabled={isBusy || isLoading} onClick={() => void save()}>
          <Plus />
          <span>{t('snapshots.new')}</span>
        </button>
        {entries.map((entry) => (
          <SnapshotCard
            key={entry.snapshot.id}
            entry={entry}
            thumbnailUrl={thumbnailUrl(entry)}
            disabled={isBusy}
            isRenaming={renamingId === entry.snapshot.id}
            onRestore={(target) => void restore(target)}
            onStartRename={(target) => setRenamingId(target.snapshot.id)}
            onFinishRename={finishRename}
            onContextMenu={openMenu}
          />
        ))}
      </div>
      {entries.length === 0 && !isLoading && (
        <p className="atlas-snapshots-hint">
          {t('snapshots.empty')}
        </p>
      )}
    </div>
  );
}
