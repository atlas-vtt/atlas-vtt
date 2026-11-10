import type { AtlasView } from '../atlas-view';
import { confirmAction } from '../ui/confirmDialog';
import { t } from '../i18n';
import type { SceneSnapshotEntry, SceneSnapshotService } from './SceneSnapshotService';
import { showNotice } from '../ui/notice';

/** Asks before a snapshot replaces the map; restoring loses what changed since and cannot be undone. */
export function confirmSnapshotRestore(entry: SceneSnapshotEntry): Promise<boolean> {
  return confirmAction({
    title: t('snapshots.restoreTitle', { name: entry.snapshot.name }),
    message: [
      t('snapshots.restoreBody'),
      t('snapshots.restoreWarning'),
    ],
    confirmLabel: t('common.restore'),
    destructive: true,
  });
}

/** Restores `entry` over the scene `view` shows and tells the GM. Throws when the rewrite fails. */
export async function restoreSnapshotInView(view: AtlasView, service: SceneSnapshotService, entry: SceneSnapshotEntry): Promise<void> {
  await view.reloadActiveScene((file) => service.restoreInto(file, entry.snapshot));
  showNotice(t('snapshots.restored', { name: entry.snapshot.name }));
}
