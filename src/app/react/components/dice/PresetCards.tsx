import React from 'react';
import { Pencil, Pin, Trash2 } from 'lucide-react';
import { setRollText } from '../../../gameSystems/diceSets';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { DiceSet } from '../../../types/diceSetTypes';
import { MAX_ROW, withPinToggled, withoutPreset, type DiceShelf, type ShelfChange } from './diceShelf';
import { TRAY_TOOLTIP_GAP } from './diceTrayPool';
import { presetText } from './presetLook';
import { t } from '../../../i18n';

/** A card's place in the list, for the cards' staggered arrival. */
const arrival = (index: number): React.CSSProperties => ({ '--atlas-preset-index': Math.min(index, 8) } as React.CSSProperties);

/** An icon control of a card, named by its tooltip. */
function CardIcon({ label, onClick, pressed, disabled, destructive, children }: {
  label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; destructive?: boolean; children: React.ReactNode;
}): React.ReactElement {
  return (
    <LabelTooltip label={label} sideOffset={TRAY_TOOLTIP_GAP}>
      <button type="button" className={destructive ? 'atlas-dice-presets__icon atlas-dice-presets__icon--destructive' : 'atlas-dice-presets__icon'}
        aria-label={label} aria-pressed={pressed} aria-disabled={disabled ? true : undefined} onClick={onClick}>
        {children}
      </button>
    </LabelTooltip>
  );
}

interface PresetCardProps {
  index: number;
  preset: DicePreset;
  pinned: boolean;
  shelf: DiceShelf;
  onRoll: () => void;
  onEdit: () => void;
  onChange: (change: ShelfChange) => void;
}

/** A saved roll: a click rolls it, the pencil opens its editor, the pin puts it in the tray's row, the bin deletes it. */
export function PresetCard({ index, preset, pinned, shelf, onRoll, onEdit, onChange }: PresetCardProps): React.ReactElement {
  const rowFull = shelf.row.length >= MAX_ROW;
  const pinLabel = pinned ? t('diceRoll.presetUnpin') : rowFull ? t('diceRoll.presetRowFull', { max: MAX_ROW }) : t('diceRoll.presetPin');
  const text = presetText(preset);
  return (
    <li className="atlas-dice-presets__card atlas-dice-presets__item" data-pinned={pinned ? '' : undefined} style={arrival(index)}>
      <button type="button" className="atlas-dice-presets__roll" onClick={onRoll} aria-label={t('diceRoll.presetRoll', { name: preset.name, formula: text })}>
        <span className="atlas-dice-presets__name">{preset.name}</span>
        <span className="atlas-dice-presets__formula">{text}</span>
      </button>
      <CardIcon label={t('diceRoll.presetEdit', { name: preset.name })} onClick={onEdit}><Pencil aria-hidden="true" /></CardIcon>
      <CardIcon label={pinLabel} pressed={pinned} disabled={!pinned && rowFull} onClick={() => {
        const change = withPinToggled(shelf, preset.id);
        if (change) onChange(change);
      }}>
        <Pin aria-hidden="true" />
      </CardIcon>
      <CardIcon label={t('diceRoll.presetDeleteNamed', { name: preset.name })} destructive onClick={() => onChange(withoutPreset(shelf, preset.id))}>
        <Trash2 aria-hidden="true" />
      </CardIcon>
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
