import React from 'react';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { alignedEntries } from '../interaction/surfaceActions';
import { t } from '../../../i18n';

/**
 * The statblock's ⋯ (§7.2), under the card at its right edge, so the card's
 * corner stays the token art's. Shown while the pointer is over the panel,
 * focus is in it or its menu is open.
 */
export function StatblockCardMenu({ entries }: { entries: ContextMenuEntry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <div className="atlas-sb-card-menu">
      <ActionsMenuButton label={t('statblockEditor.statblockOptions')} entries={alignedEntries(entries)} className="atlas-sb-card-menu__button" />
    </div>
  );
}
