import React, { useId, useState } from 'react';
import { Pin, Plus, Trash2 } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DicePreset } from '../../../types/dicePresetTypes';
import { DicePresetsRow } from './DicePresetsRow';
import { MAX_PRESET_NAME, MAX_ROW, sameSlot, withPinToggled, withSavedPreset, withoutPreset, type DiceShelf, type ShelfChange } from './diceShelf';
import { TRAY_TOOLTIP_GAP } from './diceTrayPool';
import { parseableFormula } from './diceTrayText';
import { t } from '../../../i18n';

interface DicePresetsPanelProps {
  shelf: DiceShelf;
  /** Writes a change to the collection's settings. */
  onChange: (change: ShelfChange) => void;
  /** What the tray holds now: what a new saved roll starts from. */
  trayFormula: string;
  /** Why a formula cannot be rolled, in the tray's words; null where it can. */
  problemOf: (formula: string) => string | null;
  /** Rolls a saved roll at once; the tray stays open. */
  onRoll: (preset: DicePreset) => void;
}

/** A saved roll: a click rolls it, the pin puts it in the tray's row, the bin deletes it. */
function PresetRow({ preset, pinned, rowFull, onRoll, onChange, shelf }: {
  preset: DicePreset; pinned: boolean; rowFull: boolean; shelf: DiceShelf;
  onRoll: () => void; onChange: (change: ShelfChange) => void;
}): React.ReactElement {
  const pinLabel = pinned ? t('diceRoll.presetUnpin') : rowFull ? t('diceRoll.presetRowFull', { max: MAX_ROW }) : t('diceRoll.presetPin');
  const toggle = (): void => {
    const change = withPinToggled(shelf, preset.id);
    if (change) onChange(change);
  };
  return (
    <li className="atlas-dice-presets__item">
      <button type="button" className="atlas-dice-presets__roll" onClick={onRoll} aria-label={t('diceRoll.presetRoll', { name: preset.name, formula: preset.formula })}>
        <span className="atlas-dice-presets__name">{preset.name}</span>
        <span className="atlas-dice-presets__formula">{preset.formula}</span>
      </button>
      <LabelTooltip label={pinLabel} sideOffset={TRAY_TOOLTIP_GAP}>
        <button type="button" className="atlas-dice-presets__icon" aria-label={pinLabel} aria-pressed={pinned}
          aria-disabled={!pinned && rowFull ? true : undefined} onClick={toggle}>
          <Pin aria-hidden="true" />
        </button>
      </LabelTooltip>
      <LabelTooltip label={t('diceRoll.presetDelete')} sideOffset={TRAY_TOOLTIP_GAP}>
        <button type="button" className="atlas-dice-presets__icon" aria-label={t('diceRoll.presetDeleteNamed', { name: preset.name })}
          onClick={() => onChange(withoutPreset(shelf, preset.id))}>
          <Trash2 aria-hidden="true" />
        </button>
      </LabelTooltip>
    </li>
  );
}

/**
 * The saved rolls beside the tray, with no words of its own (the saved rolls' tour explains it): the rolls, a
 * click rolling one; a name, a formula and + to save the tray's roll; the dice row as chips.
 */
export function DicePresetsPanel({ shelf, onChange, trayFormula, problemOf, onRoll }: DicePresetsPanelProps): React.ReactElement {
  const messageId = useId();
  const [name, setName] = useState('');
  // The field follows the tray until it is typed in, and again once a roll is saved.
  const [typed, setTyped] = useState<string | null>(null);
  const formula = typed ?? trayFormula;
  const [tried, setTried] = useState(false);
  const rowFull = shelf.row.length >= MAX_ROW;

  const written = parseableFormula(formula);
  const problem = written === '' ? t('diceRoll.presetNeedsFormula') : problemOf(written);
  const missingName = name.trim() === '';
  const message = tried ? (missingName ? t('diceRoll.presetNeedsName') : problem) : null;

  const save = (): void => {
    setTried(true);
    if (missingName || problem) return;
    const change = withSavedPreset(shelf, name, written);
    if (!change) return;
    onChange(change);
    setName('');
    setTyped(null);
    setTried(false);
  };
  const onEnter = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    save();
  };

  return (
    <section className="atlas-dice-panel atlas-dice-presets" aria-label={t('diceRoll.presetsTitle')}>
      {shelf.presets.length > 0 && (
        <ul className="atlas-dice-presets__list">
          {shelf.presets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              shelf={shelf}
              pinned={shelf.row.some((slot) => sameSlot(slot, { kind: 'preset', id: preset.id }))}
              rowFull={rowFull}
              onRoll={() => onRoll(preset)}
              onChange={onChange}
            />
          ))}
        </ul>
      )}

      <div className="atlas-dice-presets__form" onKeyDown={onEnter}>
        <input className="atlas-dice-presets__field" value={name} maxLength={MAX_PRESET_NAME} placeholder={t('diceRoll.presetName')}
          aria-label={t('diceRoll.presetName')} aria-describedby={messageId} aria-invalid={tried && missingName ? true : undefined}
          onChange={(event) => setName(event.target.value)} />
        <input className="atlas-dice-presets__field atlas-dice-presets__field--formula" value={formula} placeholder="1d8 + 3"
          aria-label={t('diceRoll.presetFormula')} aria-describedby={messageId} aria-invalid={tried && problem ? true : undefined}
          spellCheck={false} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
        <LabelTooltip label={t('diceRoll.presetSave')} sideOffset={TRAY_TOOLTIP_GAP}>
          <button type="button" className="atlas-dice-presets__icon atlas-dice-presets__save" aria-label={t('diceRoll.presetSave')} onClick={save}>
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
        <p id={messageId} className="atlas-dice-presets__message" aria-live="polite">{message}</p>
      </div>

      <DicePresetsRow shelf={shelf} onChange={onChange} />
    </section>
  );
}
