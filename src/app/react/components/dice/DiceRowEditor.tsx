import React, { useCallback, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { faceOf } from './DiceTrayDice';
import { MAX_ROW, typedDie, withRowDie, withRowSlotMoved, withoutRowSlot, type DiceShelf, type ShelfChange } from './diceShelf';
import { useRowDrag } from './useRowDrag';
import { t } from '../../../i18n';

interface DiceRowEditorProps {
  shelf: DiceShelf;
  onChange: (change: ShelfChange) => void;
}

/** The last place while the row has room: + opens a field in it, where a die typed (`d3`) joins the row. */
function AddDie({ shelf, onChange }: DiceRowEditorProps): React.ReactElement {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  // The field appears because + was pressed for it: it takes the focus once, as it mounts.
  const focusOnMount = useCallback((field: HTMLInputElement | null): void => field?.focus(), []);
  const add = (): void => {
    const sides = typedDie(text);
    const change = sides === null ? null : withRowDie(shelf, sides);
    setRefused(change === null);
    if (!change) return;
    onChange(change);
    setText('');
    setTyping(false);
  };
  return (
    <div className="atlas-dice-tray__die">
      {typing ? (
        <input
          className="atlas-dice-tray__face atlas-dice-tray__add-field"
          value={text}
          placeholder="d3"
          aria-label={t('diceRoll.rowAddDie')}
          aria-invalid={refused ? true : undefined}
          spellCheck={false}
          autoComplete="off"
          ref={focusOnMount}
          onChange={(event) => {
            setText(event.target.value);
            setRefused(false);
          }}
          onBlur={() => {
            if (text.trim() === '') setTyping(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            add();
          }}
        />
      ) : (
        <button type="button" className="atlas-dice-tray__face atlas-dice-tray__add" aria-label={t('diceRoll.rowAddDie')} onClick={() => setTyping(true)}>
          <Plus aria-hidden="true" />
        </button>
      )}
      <span className="atlas-dice-tray__caption" aria-hidden="true">{t('diceRoll.rowAddDieCaption')}</span>
    </div>
  );
}

/**
 * The tray's row while it is edited, as a phone's home screen is: its places wiggle, a drag moves one, its ×
 * takes it out, and + at the end adds a die of any size. Saved rolls join the row from their pin in the panel.
 */
export function DiceRowEditor({ shelf, onChange }: DiceRowEditorProps): React.ReactElement {
  const rowRef = useRef<HTMLDivElement>(null);
  const places = shelf.row.flatMap((slot) => {
    const face = faceOf(slot, shelf.presets, '', {});
    return face ? [{ slot, face }] : [];
  });
  const drag = useRowDrag(rowRef, places.length, (from, to) => {
    const change = withRowSlotMoved(shelf, from, to);
    if (change) onChange(change);
  });
  const room = shelf.row.length < MAX_ROW;

  return (
    <div
      ref={rowRef}
      className={cn('atlas-dice-tray__dice', 'atlas-dice-tray__dice--editing', drag.settling && 'atlas-dice-tray__dice--settling')}
      style={{ '--atlas-tray-slots': Math.max(places.length + (room ? 1 : 0), 1) } as React.CSSProperties}
      // The dice are images, which the browser would drag as files and cancel the pointer for.
      onDragStart={(event) => event.preventDefault()}
      role="group"
      aria-label={t('diceRoll.rowTitle')}
    >
      {places.map(({ slot, face }, place) => (
        <div
          key={face.key}
          className="atlas-dice-tray__die"
          data-held={drag.held === place ? '' : undefined}
          style={{ translate: `${drag.offsetOf(place)}px 0` }}
          onPointerDown={(event) => drag.onPointerDown(place, event)}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onKeyDown={(event) => {
            if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            const change = withRowSlotMoved(shelf, place, place + (event.key === 'ArrowLeft' ? -1 : 1));
            if (change) onChange(change);
          }}
        >
          <div className="atlas-dice-tray__face" role="img" tabIndex={0} aria-label={t('diceRoll.rowPlace', { name: face.caption, place: place + 1 })}>
            {face.art}
          </div>
          <button
            type="button"
            className="atlas-dice-tray__remove"
            aria-label={t('diceRoll.rowRemove', { name: face.caption })}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onChange(withoutRowSlot(shelf, place))}
          >
            <X aria-hidden="true" />
          </button>
          <span className="atlas-dice-tray__caption" aria-hidden="true">{face.caption}</span>
        </div>
      ))}
      {room && <AddDie shelf={shelf} onChange={onChange} />}
    </div>
  );
}
