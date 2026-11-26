import React from 'react';
import { ChevronDown, Dices, Minus, Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { HeaderMenu } from '../../../packages/components/asset-manager/components/HeaderMenu';
import { rarityKey } from '../../../loot/lootRoller';
import type { RarityOption } from '../../../types/randomTableTypes';
import { LOOT_MAX_COUNT } from '../../../stores/lootRollerSlice';
import { t } from '../../../i18n';

interface RarityTogglesProps {
  /** The collection's rarity words, in their order. */
  rarities: readonly RarityOption[];
  /** Items of each word (`rarityKey`) in the ticked views; empty when no item names one. */
  rarityCounts: ReadonlyMap<string, number>;
  excluded: ReadonlySet<string>;
  onExcludedChange: (excluded: string[]) => void;
}

/** A rarity's gem in its tone: filled while it is rolled, an outline while it is left out. */
function RarityGem({ tone, on }: { tone: string | undefined; on: boolean }): React.ReactElement {
  return <span className={`atlas-loot-rarity__gem${on ? ' is-on' : ''}`} data-rarity={tone} />;
}

/** What the folded filter's button says: all, none, or how many of the rarities are rolled. */
function rarityMenuLabel(on: number, total: number): string {
  if (on === total) return t('loot.rarityMenu.all');
  if (on === 0) return t('loot.rarityMenu.none');
  return t('loot.rarityMenu.some', { on, total });
}

/**
 * A toggle per rarity word of the collection, in its tone: switched-off rarities are never rolled. Where the roll bar
 * has no room for the toggles side by side (its `data-compact`), they fold into a menu of switches instead.
 */
export function RarityToggles({ rarities, rarityCounts, excluded, onExcludedChange }: RarityTogglesProps): React.ReactElement | null {
  if (rarityCounts.size === 0 || rarities.length === 0) return null;
  const toggle = (key: string): void => {
    const next = new Set(excluded);
    if (!next.delete(key)) next.add(key);
    onExcludedChange([...next]);
  };
  const options = rarities.map((option) => {
    const key = rarityKey(option);
    return { option, key, on: !excluded.has(key), count: rarityCounts.get(key) ?? 0 };
  });
  const onCount = options.filter((entry) => entry.on).length;

  return (
    <>
      <div className="atlas-loot-rarities" role="group" aria-label={t('loot.rarities')}>
        {options.map(({ option, key, on, count }) => {
          const values = { count, rarity: option.name };
          return (
            <LabelTooltip key={key} describe label={on ? t('loot.rarityOn', values) : t('loot.rarityOff', values)}>
              <button
                type="button"
                className={`atlas-loot-rarity${on ? ' is-on' : ''}`}
                data-rarity={option.tone ?? undefined}
                aria-pressed={on}
                onClick={() => toggle(key)}
              >
                <RarityGem tone={undefined} on={on} />
                <span className="atlas-loot-rarity__label">{option.name}</span>
                <span className="atlas-loot-rarity__count">{count}</span>
              </button>
            </LabelTooltip>
          );
        })}
      </div>
      <HeaderMenu
        className="atlas-loot-rarity-menu"
        label={t('loot.rarities')}
        triggerClassName="atlas-am-tab-menu-trigger atlas-loot-rarity-menu__trigger"
        align="start"
        multiple
        triggerContent={
          <>
            <span className="atlas-loot-rarity-menu__gems">
              {options.map(({ option, key, on }) => <RarityGem key={key} tone={option.tone ?? undefined} on={on} />)}
            </span>
            <span className="atlas-tab-label">{rarityMenuLabel(onCount, options.length)}</span>
            <ChevronDown className="atlas-am-tab-menu-chevron" />
          </>
        }
        items={options.map(({ option, key, on, count }) => ({
          key,
          label: option.name,
          icon: <RarityGem tone={option.tone ?? undefined} on />,
          detail: count,
          checked: on,
          onSelect: () => toggle(key),
        }))}
      />
    </>
  );
}

interface RollActionsProps {
  count: number;
  /** The stepper's unit: what one roll gives. */
  unit: 'items' | 'results';
  onCountChange: (count: number) => void;
  /** The button's text and, where it differs, its name for assistive technology. */
  rollLabel: string;
  rollName?: string;
  /** What a roll does, or why it cannot be made. */
  hint: string;
  disabled: boolean;
  onRoll: () => void;
}

/** How many to roll, and the Roll button. */
export function RollActions({ count, unit, onCountChange, rollLabel, rollName, hint, disabled, onRoll }: RollActionsProps): React.ReactElement {
  return (
    <div className="atlas-loot-rollbar__actions">
      <div className="atlas-loot-stepper" role="group" aria-label={t('loot.count')}>
        <LabelTooltip label={t('loot.fewer')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-stepper__button"
            disabled={count <= 1}
            onClick={() => onCountChange(count - 1)}
          >
            <Minus />
          </Button>
        </LabelTooltip>
        <span className="atlas-loot-stepper__value" aria-live="polite">
          {count}
          <span className="atlas-loot-stepper__unit">{t(unit === 'items' ? 'tables.unit.items' : 'tables.unit.results', { count })}</span>
        </span>
        <LabelTooltip label={t('loot.more')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-stepper__button"
            disabled={count >= LOOT_MAX_COUNT}
            onClick={() => onCountChange(count + 1)}
          >
            <Plus />
          </Button>
        </LabelTooltip>
      </div>
      <LabelTooltip describe label={hint}>
        {/* The span takes the hover while the button is disabled, so the hint still shows. */}
        <span className="atlas-loot-roll-trigger">
          <Button
            variant="default"
            className="atlas-loot-roll-button"
            disabled={disabled}
            onClick={onRoll}
            {...(rollName !== undefined && { 'aria-label': rollName })}
          >
            <Dices />
            {rollLabel}
          </Button>
        </span>
      </LabelTooltip>
    </div>
  );
}
