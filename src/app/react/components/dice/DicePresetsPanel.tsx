import React, { useId, useState } from 'react';
import { Pin, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DicePreset } from '../../../types/dicePresetTypes';
import { DicePresetsRow } from './DicePresetsRow';
import { MAX_PRESET_NAME, MAX_ROW, sameSlot, withPinToggled, withSavedPreset, withoutPreset, type DiceShelf, type ShelfChange } from './diceShelf';
import { TRAY_TOOLTIP_GAP } from './diceTrayPool';
import { parseableFormula } from './diceTrayText';
import { t } from '../../../i18n';

interface DicePresetsPanelProps {
  shelf: DiceShelf;
  /** Writes a change; null where the map is in no collection, which keeps no saved rolls. */
  onChange: ((change: ShelfChange) => void) | null;
  /** What the tray holds now: what a new saved roll starts from. */
  trayFormula: string;
  /** Why a formula cannot be rolled, in the tray's words; null where it can. */
  problemOf: (formula: string) => string | null;
  /** Rolls a saved roll at once; the tray stays open. */
  onRoll: (preset: DicePreset) => void;
  onClose: () => void;
}

/** A saved roll: a click rolls it, the pin puts it in the tray's row, the bin deletes it. */
function PresetRow({ preset, pinned, rowFull, onRoll, onChange, shelf }: {
  preset: DicePreset; pinned: boolean; rowFull: boolean; shelf: DiceShelf;
  onRoll: () => void; onChange: ((change: ShelfChange) => void) | null;
}): React.ReactElement {
  const pinLabel = pinned ? t('diceRoll.presetUnpin') : rowFull ? t('diceRoll.presetRowFull', { max: MAX_ROW }) : t('diceRoll.presetPin');
  const toggle = (): void => {
    const change = withPinToggled(shelf, preset.id);
    if (change) onChange?.(change);
  };
  return (
    <li className="atlas-dice-presets__item">
      <button type="button" className="atlas-dice-presets__roll" onClick={onRoll} aria-label={t('diceRoll.presetRoll', { name: preset.name, formula: preset.formula })}>
        <span className="atlas-dice-presets__name">{preset.name}</span>
        <span className="atlas-dice-presets__formula">{preset.formula}</span>
      </button>
      {onChange && (
        <>
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
        </>
      )}
    </li>
  );
}

/**
 * The saved rolls beside the tray: rolls a collection keeps to roll with one click, a form that saves the tray's
 * roll under a name, and the tray's row, where dice and saved rolls take the places of the standard dice.
 */
export function DicePresetsPanel({ shelf, onChange, trayFormula, problemOf, onRoll, onClose }: DicePresetsPanelProps): React.ReactElement {
  const titleId = useId();
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
    if (!onChange || missingName || problem) return;
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
    <section className="atlas-dice-panel atlas-dice-presets" aria-labelledby={titleId}>
      <header className="atlas-dice-presets__header">
        <h3 id={titleId} className="atlas-dice-presets__title">{t('diceRoll.presetsTitle')}</h3>
        <CloseButton onClick={onClose} />
      </header>

      {shelf.presets.length > 0 ? (
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
      ) : (
        <p className="atlas-dice-presets__note">{onChange ? t('diceRoll.presetsEmpty') : t('diceRoll.presetsNoCollection')}</p>
      )}

      {onChange && (
        <div className="atlas-dice-presets__form" onKeyDown={onEnter}>
          <input className="atlas-dice-presets__field" value={name} maxLength={MAX_PRESET_NAME} placeholder={t('diceRoll.presetNamePlaceholder')}
            aria-label={t('diceRoll.presetName')} aria-describedby={messageId} aria-invalid={tried && missingName ? true : undefined}
            onChange={(event) => setName(event.target.value)} />
          <input className="atlas-dice-presets__field atlas-dice-presets__field--formula" value={formula} placeholder="1d8 + 3[slashing]"
            aria-label={t('diceRoll.presetFormula')} aria-describedby={messageId} aria-invalid={tried && problem ? true : undefined}
            spellCheck={false} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
          <Button className="atlas-dice-presets__save" onClick={save}>{t('diceRoll.presetSave')}</Button>
          <p id={messageId} className="atlas-dice-presets__message" aria-live="polite">{message}</p>
        </div>
      )}

      {onChange && <DicePresetsRow shelf={shelf} onChange={onChange} />}
    </section>
  );
}
