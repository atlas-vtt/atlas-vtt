import React, { useEffect, useRef } from 'react';
import { CoinIcon } from '../CoinIcon';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import type { LootDraw } from '../../../loot/lootRoller';
import { rarityTone } from '../../../loot/lootRarity';
import { LootItemContent } from './LootItemContent';
import { t } from '../../../i18n';

interface PlayerLootWindowProps {
  items: readonly LootDraw[];
  onClose: () => void;
}

/**
 * The loot window in the player view. An Atlas panel holding the same cards
 * as the DM's loot roller, larger so players across the table can read them:
 * name, rarity and type, value, description and properties, but not where it
 * was rolled.
 */
export function PlayerLootWindow({ items, onClose }: PlayerLootWindowProps): React.ReactElement {
  const listRef = useRef<HTMLOListElement>(null);
  const lastId = items[items.length - 1]?.id;

  // Bring the newest item into view as the DM hands out more.
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lastId]);

  return (
    <div className="atlas-player-loot">
      <div className="atlas-player-loot__scrim" onClick={onClose} />
      <section className="atlas-player-loot__window" role="dialog" aria-label={t('loot.received')}>
        <header className="atlas-player-loot__header">
          <span className="atlas-player-loot__badge"><CoinIcon /></span>
          <h2 className="atlas-player-loot__title">{t('loot.received')}</h2>
          <span className="atlas-player-loot__count">{t('loot.items', { count: items.length })}</span>
          <CloseButton onClick={onClose} aria-label={t('loot.closeWindow')} />
        </header>
        <ol className="atlas-player-loot__items" ref={listRef}>
          {items.map((item) => (
            <li key={item.id} className="atlas-loot-card atlas-loot-card--large" data-rarity={item.tone ?? rarityTone(item.rarity)}>
              <LootItemContent draw={item} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
