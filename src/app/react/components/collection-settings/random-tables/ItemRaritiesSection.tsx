import React, { useState } from 'react';
import { GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { RARITY_LABELS, RARITY_TONES, type RarityTone } from '../../../../loot/lootRarity';
import type { RarityOption } from '../../../../types/randomTableTypes';
import { t } from '../../../../i18n';

interface ItemRaritiesSectionProps {
  /** The words the collection reads: its own, else its system's. */
  rarities: readonly RarityOption[];
  /** The collection keeps words of its own. */
  own: boolean;
  onChange: (rarities: readonly RarityOption[]) => void;
  /** Goes back to the system's words. */
  onRevert: () => void;
}

const TONES: readonly (RarityTone | null)[] = [null, ...RARITY_TONES];

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/** The words the collection's items name their rarity with, each painted in a tone of the ladder or none. */
export function ItemRaritiesSection({ rarities, own, onChange, onRevert }: ItemRaritiesSectionProps): React.ReactElement {
  const [dragged, setDragged] = useState<number | null>(null);
  const edit = (index: number, change: Partial<RarityOption>): void =>
    onChange(rarities.map((option, i) => (i === index ? { ...option, ...change } : option)));

  return (
    <div className="atlas-csm-field atlas-rt-rarities">
      <div className="atlas-rt-section-head">
        <span className="atlas-csm-label">{t('tables.settings.rarities')}</span>
        {own && (
          <Button variant="ghost" className="atlas-csm-add-btn" onClick={onRevert}>
            <RotateCcw />
            {t('tables.settings.systemRarities')}
          </Button>
        )}
      </div>
      <ol className="atlas-rt-rarities__list">
        {rarities.map((option, index) => (
          <li
            key={index}
            className={`atlas-rt-rarity${dragged === index ? ' is-dragged' : ''}`}
            onDragOver={(event) => {
              if (dragged === null || dragged === index) return;
              event.preventDefault();
              onChange(moved(rarities, dragged, index));
              setDragged(index);
            }}
          >
            <LabelTooltip label={t('tables.settings.moveRarity')}>
              <button
                type="button"
                className="atlas-rt-rarity__grip"
                draggable
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDragged(index); }}
                onDragEnd={() => setDragged(null)}
                onKeyDown={(event) => {
                  const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : -1;
                  if (!event.altKey || to < 0 || to >= rarities.length) return;
                  event.preventDefault();
                  onChange(moved(rarities, index, to));
                }}
              >
                <GripVertical />
              </button>
            </LabelTooltip>
            <input
              type="text"
              className="atlas-csm-input atlas-rt-rarity__name"
              value={option.name}
              aria-label={t('tables.settings.rarityName')}
              onChange={(event) => edit(index, { name: event.target.value })}
            />
            <div className="atlas-rt-tones" role="radiogroup" aria-label={t('tables.settings.toneOf', { name: option.name })}>
              {TONES.map((tone) => {
                const label = tone ? RARITY_LABELS[tone] : t('tables.settings.tone.none');
                return (
                  <LabelTooltip key={tone ?? 'none'} label={label}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={option.tone === tone}
                      className={`atlas-rt-tone${option.tone === tone ? ' is-chosen' : ''}`}
                      data-rarity={tone ?? 'none'}
                      onClick={() => edit(index, { tone })}
                    />
                  </LabelTooltip>
                );
              })}
            </div>
            <LabelTooltip label={t('tables.settings.removeRarity')}>
              <Button variant="ghost" size="icon" className="atlas-rt-row__remove" onClick={() => onChange(rarities.filter((_, i) => i !== index))}>
                <Trash2 />
              </Button>
            </LabelTooltip>
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => onChange([...rarities, { name: '', tone: null }])}>
        <Plus />
        {t('tables.settings.addRarity')}
      </Button>
    </div>
  );
}
