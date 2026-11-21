import React, { useId, useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { DiceSet } from '../../../types/diceSetTypes';
import { MAX_PRESET_NAME, newPreset, sameSlot, withSavedPreset, type DiceShelf, type ShelfChange } from './diceShelf';
import { LabSetCard, PresetCard } from './PresetCards';
import { lookOfFormula, lookOfSet } from './presetLook';
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
  /** Opens a saved roll's editor; a roll just saved opens in it, so its dice can be dressed at once. */
  onEdit: (id: string) => void;
  /** The Dice Lab's sets, which can be kept as saved rolls. */
  sets: readonly DiceSet[];
  /** The editor of a saved roll, floating above the cards. */
  children?: React.ReactNode;
  /** The saved roll whose editor is open: its card stays lit, so it is clear which one is edited. */
  editingId?: string | null | undefined;
}

/**
 * The saved rolls beside the tray, as floating cards with no panel behind them and no words of their own (the
 * saved rolls' tour explains them): first a card that saves the tray's roll under a name, then one card per saved
 * roll, a click rolling it, its pin putting it in the tray's row. Top to top with the tray, and as tall.
 */
export function DicePresetsPanel({ shelf, onChange, trayFormula, problemOf, onRoll, onEdit, sets, children, editingId = null }: DicePresetsPanelProps): React.ReactElement {
  const messageId = useId();
  const [name, setName] = useState('');
  // The field follows the tray until it is typed in, and again once a roll is saved.
  const [typed, setTyped] = useState<string | null>(null);
  const formula = typed ?? trayFormula;
  const [tried, setTried] = useState(false);
  // The list shows the Dice Lab's sets instead of the saved rolls while one is being picked.
  const [picking, setPicking] = useState(false);

  const written = parseableFormula(formula);
  const problem = written === '' ? t('diceRoll.presetNeedsFormula') : problemOf(written);
  const missingName = name.trim() === '';
  const message = tried ? (missingName ? t('diceRoll.presetNeedsName') : problem) : null;

  /** Keeps `preset` and opens it in the editor. */
  const keep = (preset: DicePreset): boolean => {
    const change = withSavedPreset(shelf, preset);
    if (!change) return false;
    onChange(change);
    onEdit(preset.id);
    return true;
  };

  // A formula of plain dice becomes dice to dress (each die's name and colour); any other keeps its formula.
  const save = (): void => {
    setTried(true);
    if (missingName || problem) return;
    const designed = lookOfFormula(written);
    if (!keep(designed ? newPreset(name, designed.bonus, designed.look) : newPreset(name, written))) return;
    setName('');
    setTyped(null);
    setTried(false);
  };

  const pick = (set: DiceSet): void => {
    if (keep(newPreset(set.name, '', lookOfSet(set)))) setPicking(false);
  };

  const onEnter = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    save();
  };

  return (
    <section className="atlas-dice-presets" aria-label={t('diceRoll.presetsTitle')}>
      <div className="atlas-dice-presets__card atlas-dice-presets__form" onKeyDown={onEnter}>
        <input className="atlas-dice-presets__field" value={name} maxLength={MAX_PRESET_NAME} placeholder={t('diceRoll.presetName')}
          aria-label={t('diceRoll.presetName')} aria-describedby={messageId} aria-invalid={tried && missingName ? true : undefined}
          onChange={(event) => setName(event.target.value)} />
        <span className="atlas-dice-presets__divider" aria-hidden="true" />
        <input className="atlas-dice-presets__field atlas-dice-presets__field--formula" value={formula} placeholder="1d8 + 3"
          aria-label={t('diceRoll.presetFormula')} aria-describedby={messageId} aria-invalid={tried && problem ? true : undefined}
          spellCheck={false} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
        <LabelTooltip label={t('diceRoll.presetFromLab')} sideOffset={TRAY_TOOLTIP_GAP}>
          <button type="button" className="atlas-dice-presets__icon atlas-dice-presets__save" aria-label={t('diceRoll.presetFromLab')}
            aria-pressed={picking} onClick={() => setPicking(!picking)}>
            <FlaskConical aria-hidden="true" />
          </button>
        </LabelTooltip>
        <LabelTooltip label={t('diceRoll.presetSave')} sideOffset={TRAY_TOOLTIP_GAP}>
          <button type="button" className="atlas-dice-presets__icon atlas-dice-presets__save" aria-label={t('diceRoll.presetSave')} onClick={save}>
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
        <p id={messageId} className="atlas-dice-presets__message" aria-live="polite">{message}</p>
      </div>

      {/* Each saved roll floats on its own; the list scrolls within the tray's height. */}
      <ul className="atlas-dice-presets__list" aria-label={picking ? t('diceRoll.presetFromLab') : t('diceRoll.presetsTitle')}>
        {picking
          ? sets.map((set, index) => <LabSetCard key={set.id} index={index} set={set} onPick={() => pick(set)} />)
          : shelf.presets.map((preset, index) => (
            <PresetCard
              key={preset.id}
              index={index}
              preset={preset}
              shelf={shelf}
              pinned={shelf.row.some((slot) => sameSlot(slot, { kind: 'preset', id: preset.id }))}
              onRoll={() => onRoll(preset)}
              onEdit={() => onEdit(preset.id)}
              editing={preset.id === editingId}
              onChange={onChange}
            />
          ))}
      </ul>
      {children}
    </section>
  );
}
