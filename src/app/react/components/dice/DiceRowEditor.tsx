import React, { useCallback, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { faceOf, rowColumns } from './DiceTrayDice';
import { MAX_ROW, typedRowDie, withRowDie, withRowSlotMoved, withoutRowSlot, type DiceShelf, type RowDieProblem, type ShelfChange } from './diceShelf';
import { useRowDrag } from '../../hooks/useRowDrag';
import { t } from '../../../i18n';

interface DiceRowEditorProps {
  shelf: DiceShelf;
  onChange: (change: ShelfChange) => void;
}

/** Why a typed die stays out of the row, in words. */
function problemText(problem: RowDieProblem, sides: number | null): string {
  switch (problem) {
    case 'not-a-die': return t('diceRoll.rowNotADie');
    case 'faces': return t('diceRoll.rowFaces', { min: 2, max: 1000 });
    case 'present': return t('diceRoll.rowPresent', { sides: sides ?? 0 });
    case 'full': return t('diceRoll.presetRowFull', { max: MAX_ROW });
  }
}

/**
 * The last place while the row has room: + opens a field in it, where a die typed (`d3`) joins the row. A die that
 * cannot join shakes the field and says why under the row (`onProblem`), until the field changes.
 */
function AddDie({ shelf, onChange, onProblem }: DiceRowEditorProps & { onProblem: (text: string | null) => void }): React.ReactElement {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  // Every refusal shakes again: two identical keyframes, taken in turn, restart the animation.
  const [shakes, setShakes] = useState(0);
  // The field appears because + was pressed for it: it takes the focus once, as it mounts.
  const focusOnMount = useCallback((field: HTMLInputElement | null): void => field?.focus(), []);
  const add = (): void => {
    const { sides, problem } = typedRowDie(shelf, text);
    const change = problem === null && sides !== null ? withRowDie(shelf, sides) : null;
    setRefused(change === null);
    onProblem(change ? null : problemText(problem ?? 'not-a-die', sides));
    if (!change) {
      setShakes((count) => count + 1);
      return;
    }
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
          data-shake={shakes > 0 ? shakes % 2 : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setRefused(false);
            onProblem(null);
          }}
          onBlur={() => {
            if (text.trim() !== '') return;
            setTyping(false);
            onProblem(null);
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
  const drag = useRowDrag(() => [...(rowRef.current?.children ?? [])].slice(0, places.length), (from, to) => {
    const change = withRowSlotMoved(shelf, from, to);
    if (change) onChange(change);
  });
  const room = shelf.row.length < MAX_ROW;
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="atlas-dice-tray__row-edit">
      <div
        ref={rowRef}
        className={cn('atlas-dice-tray__dice', 'atlas-dice-tray__dice--editing', drag.settling && 'atlas-dice-tray__dice--settling')}
        style={{ '--atlas-tray-slots': rowColumns(places.length + (room ? 1 : 0)) } as React.CSSProperties}
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
            style={{ translate: drag.offsetOf(place) }}
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
        {room && <AddDie shelf={shelf} onChange={onChange} onProblem={setProblem} />}
      </div>
      {/* Out of the flow, in the gap under the row, so nothing moves when it speaks. */}
      <p className="atlas-dice-tray__row-note" role="status" aria-live="polite">{problem}</p>
    </div>
  );
}
