import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { DiceRowSlot } from '../../../types/dicePresetTypes';
import { MAX_ROW, STANDARD_ROW_CHANGE, typedDie, withRowDie, withRowSlotMoved, withoutRowSlot, type DiceShelf, type ShelfChange } from './diceShelf';
import { t } from '../../../i18n';

interface DicePresetsRowProps {
  shelf: DiceShelf;
  onChange: (change: ShelfChange) => void;
}

function slotName(slot: DiceRowSlot, shelf: DiceShelf): string {
  if (slot.kind === 'die') return t('diceRoll.die', { sides: slot.sides });
  return shelf.presets.find((preset) => preset.id === slot.id)?.name ?? '';
}

/**
 * The tray's row as chips, in its order: × takes a place out, a drag (or Alt with an arrow key) moves it, a die
 * typed below joins the end. Saved rolls join from their pin. Standard dice puts the seven back.
 */
export function DicePresetsRow({ shelf, onChange }: DicePresetsRowProps): React.ReactElement {
  // While a chip is dragged the row is reordered here alone, and written once it is let go.
  const [dragged, setDragged] = useState<number | null>(null);
  const [preview, setPreview] = useState<readonly DiceRowSlot[] | null>(null);
  const row = preview ?? shelf.row;
  const [die, setDie] = useState('');
  const [refused, setRefused] = useState(false);
  const full = shelf.row.length >= MAX_ROW;

  const move = (from: number, to: number): void => {
    const change = withRowSlotMoved(shelf, from, to);
    if (change) onChange(change);
  };
  const addDie = (): void => {
    const sides = typedDie(die);
    const change = sides === null ? null : withRowDie(shelf, sides);
    setRefused(change === null);
    if (!change) return;
    onChange(change);
    setDie('');
  };

  return (
    <div className="atlas-dice-presets__row-editor">
      <div className="atlas-dice-presets__label-line">
        <span className="atlas-dice-presets__label">{t('diceRoll.rowTitle', { count: shelf.row.length, max: MAX_ROW })}</span>
        {shelf.ownRow && (
          <button type="button" className="atlas-dice-presets__link" onClick={() => onChange(STANDARD_ROW_CHANGE)}>{t('diceRoll.rowStandard')}</button>
        )}
      </div>
      <ol className="atlas-dice-presets__chips">
        {row.map((slot, place) => {
          const name = slotName(slot, shelf);
          return (
            <li
              key={slot.kind === 'die' ? `d${slot.sides}` : slot.id}
              className="atlas-dice-presets__chip"
              data-dragged={dragged === place ? '' : undefined}
              draggable
              onDragStart={(event) => {
                setDragged(place);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (dragged === null) return;
                event.preventDefault();
                if (dragged === place) return;
                const next = [...row];
                const [moved] = next.splice(dragged, 1);
                next.splice(place, 0, moved!);
                setPreview(next);
                setDragged(place);
              }}
              onDrop={(event) => event.preventDefault()}
              onDragEnd={() => {
                if (preview) onChange({ diceRow: [...preview] });
                setPreview(null);
                setDragged(null);
              }}
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
                event.preventDefault();
                move(place, place + (event.key === 'ArrowLeft' ? -1 : 1));
              }}
              tabIndex={0}
              aria-label={t('diceRoll.rowPlace', { name, place: place + 1 })}
            >
              <span className="atlas-dice-presets__chip-name">{name}</span>
              <button type="button" className="atlas-dice-presets__chip-remove" aria-label={t('diceRoll.rowRemove', { name })}
                onClick={() => onChange(withoutRowSlot(shelf, place))}>
                <X aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="atlas-dice-presets__add">
        <input
          className="atlas-dice-presets__field"
          value={die}
          placeholder="d3"
          disabled={full}
          aria-label={t('diceRoll.rowAddDie')}
          aria-invalid={refused ? true : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setDie(event.target.value);
            setRefused(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            addDie();
          }}
        />
        <button type="button" className="atlas-dice-presets__link" disabled={full || die.trim() === ''} onClick={addDie}>{t('diceRoll.rowAddDie')}</button>
      </div>
    </div>
  );
}
