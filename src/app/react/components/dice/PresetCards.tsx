import React from 'react';
import { Pin } from 'lucide-react';
import { setRollText } from '../../../gameSystems/diceSets';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../context-menu/AtlasContextMenu';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { DiceSet } from '../../../types/diceSetTypes';
import { MAX_ROW, withPinToggled, withoutPreset, type DiceShelf, type ShelfChange } from './diceShelf';
import { presetText } from './presetLook';
import { t } from '../../../i18n';

/** A card's place in the list, for the cards' staggered arrival. */
const arrival = (index: number): React.CSSProperties => ({ '--atlas-preset-index': Math.min(index, 8) } as React.CSSProperties);

interface PresetCardProps {
  index: number;
  preset: DicePreset;
  pinned: boolean;
  shelf: DiceShelf;
  onRoll: () => void;
  onEdit: () => void;
  onChange: (change: ShelfChange) => void;
}

/**
 * A saved roll: a click rolls it; a pin beside its name says it stands in the tray's row. Its ⋯, shown only under
 * the pointer (or with focus inside, or while its menu is open), holds Edit, the dice row and Delete.
 */
export function PresetCard({ index, preset, pinned, shelf, onRoll, onEdit, onChange }: PresetCardProps): React.ReactElement {
  const rowFull = shelf.row.length >= MAX_ROW;
  const text = presetText(preset);
  const entries: ContextMenuEntry[] = [
    { type: 'item', label: t('diceRoll.presetEditShort'), icon: 'pencil', onClick: onEdit },
    {
      type: 'item',
      label: pinned ? t('diceRoll.presetUnpin') : t('diceRoll.presetPin'),
      icon: pinned ? 'pin-off' : 'pin',
      disabled: !pinned && rowFull,
      ...(!pinned && rowFull && { description: t('diceRoll.presetRowFull', { max: MAX_ROW }) }),
      onClick: () => {
        const change = withPinToggled(shelf, preset.id);
        if (change) onChange(change);
      },
    },
    { type: 'item', label: t('diceRoll.presetDelete'), icon: 'trash-2', destructive: true, onClick: () => onChange(withoutPreset(shelf, preset.id)) },
  ];
  return (
    <li className="atlas-dice-presets__card atlas-dice-presets__item" data-pinned={pinned ? '' : undefined} style={arrival(index)}>
      <button type="button" className="atlas-dice-presets__roll" onClick={onRoll} aria-label={t('diceRoll.presetRoll', { name: preset.name, formula: text })}>
        <span className="atlas-dice-presets__name">
          {preset.name}
          {pinned && <Pin aria-hidden="true" className="atlas-dice-presets__pinned" />}
        </span>
        <span className="atlas-dice-presets__formula">{text}</span>
      </button>
      <ActionsMenuButton label={t('diceRoll.presetActions', { name: preset.name })} entries={entries} className="atlas-dice-presets__more" />
    </li>
  );
}

/** A set of the Dice Lab, offered to be kept as a saved roll: a click copies its dice and rules. */
export function LabSetCard({ index, set, onPick }: { index: number; set: DiceSet; onPick: () => void }): React.ReactElement {
  return (
    <li className="atlas-dice-presets__card atlas-dice-presets__item" style={arrival(index)}>
      <button type="button" className="atlas-dice-presets__roll" onClick={onPick} aria-label={t('diceRoll.presetFromSet', { name: set.name })}>
        <span className="atlas-dice-presets__name">{set.name}</span>
        <span className="atlas-dice-presets__formula">{setRollText(set.dice)}</span>
      </button>
    </li>
  );
}
