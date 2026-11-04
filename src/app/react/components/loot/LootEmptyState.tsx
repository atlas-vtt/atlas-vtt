import React from 'react';
import { FileWarning, FolderInput, Plus } from 'lucide-react';
import { CoinIcon } from '../CoinIcon';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';

interface LootEmptyStateProps {
  inCollection: boolean;
  /** The collection's loot bases cannot be read: Obsidian's Bases core plugin is off. */
  basesOff: boolean;
  /** Writes a new table from pasted text; absent where the window offers none. */
  onNewTable?: () => void;
  /** Opens the collection's Random tables settings, to take tables from notes and bases. */
  onUseNote: () => void;
}

/** What the Random tables window shows before the collection has a table to roll on, and how to give it one. */
export function LootEmptyState({ inCollection, basesOff, onNewTable, onUseNote }: LootEmptyStateProps): React.ReactElement {
  if (!inCollection || basesOff) {
    return (
      <div className="atlas-loot-empty">
        <span className="atlas-loot-empty__icon"><FileWarning /></span>
        <p className="atlas-loot-empty__title">{t(inCollection ? 'loot.empty.basesOff' : 'loot.empty.noCollection')}</p>
        <p className="atlas-loot-empty__body">{t(inCollection ? 'loot.empty.basesOffBody' : 'loot.empty.noCollectionBody')}</p>
      </div>
    );
  }

  return (
    <div className="atlas-loot-empty">
      <span className="atlas-loot-empty__icon"><CoinIcon /></span>
      <p className="atlas-loot-empty__title">{t('tables.empty')}</p>
      <div className="atlas-loot-empty__actions">
        {onNewTable && (
          <Button variant="default" onClick={onNewTable}>
            <Plus />
            {t('tables.newTable')}
          </Button>
        )}
        <Button variant={onNewTable ? 'ghost' : 'default'} onClick={onUseNote}>
          <FolderInput />
          {t('tables.fromNote')}
        </Button>
      </div>
    </div>
  );
}
