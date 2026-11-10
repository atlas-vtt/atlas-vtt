import React, { useCallback, useId, useState } from 'react';
import { cn } from '../../../../../utils/cn';
import { MAX_SET_SIDES } from '../../../../gameSystems/diceSets';
import { t } from '../../../../i18n';
import { notation } from './dieNames';
import { DieStill, PlainDie } from './DieStill';
import { COMMON_SIDES, type DieChange, type LabDie } from './labDice';
import { useDieImages } from './useDieImages';

interface SidesStepProps {
  die: LabDie;
  onChange: (change: DieChange, pace: 'now' | 'typing') => void;
  /** Enter in the number: the step is done. */
  onDone: () => void;
}

/** The height a die is drawn at on its tile. */
const TILE_DIE = 44;
const COLUMNS = 4;

/**
 * The tiles' places on a grid of four columns: a row of four dice, then the
 * d12, the d20 and the d100, whose two d10s lie side by side over two columns.
 */
const PLACES = COMMON_SIDES.map((sides, i) => ({ sides, row: Math.floor(i / COLUMNS), col: i % COLUMNS, span: sides === 100 ? 2 : 1 }));

/** The tile focus goes to from `index` with `key`: along a row, or to the tile over the same column above or below. */
function tileStep(key: string, index: number): number | null {
  const at = PLACES[index]!;
  const covers = (row: number, col: number): number => PLACES.findIndex((place) => place.row === row && col >= place.col && col < place.col + place.span);
  switch (key) {
    case 'ArrowRight': return Math.min(PLACES.length - 1, index + 1);
    case 'ArrowLeft': return Math.max(0, index - 1);
    case 'ArrowDown': { const below = covers(at.row + 1, at.col); return below < 0 ? index : below; }
    case 'ArrowUp': { const above = covers(at.row - 1, at.col); return above < 0 ? index : above; }
    case 'Home': return 0;
    case 'End': return PLACES.length - 1;
    default: return null;
  }
}

const isSides = (value: number): boolean => Number.isInteger(value) && value >= 2 && value <= MAX_SET_SIDES;

/**
 * The Sides step of a die's fan: the common dice as tiles, each drawn as it
 * will roll in the die's own colour with its sides under it, and a row for any
 * other number of sides, whose die has no body and shows as a flat tile.
 * The arrow keys move across the tiles; Enter or Space picks one.
 */
export function SidesStep({ die, onChange, onDone }: SidesStepProps): React.ReactElement {
  const [doc, setDoc] = useState<Document | null>(null);
  const grid = useCallback((element: HTMLDivElement | null): void => setDoc(element?.ownerDocument ?? null), []);
  const common = (COMMON_SIDES as readonly number[]).includes(die.sides);
  const [typed, setTyped] = useState(common ? '' : String(die.sides));
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const image = useDieImages(COMMON_SIDES.map((sides) => ({ sides, colour: die.colour })), doc);
  const inputId = useId();
  const labelId = useId();
  const chosenAt = COMMON_SIDES.findIndex((sides) => sides === die.sides);
  const tabStop = focusAt ?? Math.max(0, chosenAt);
  const invalid = typed !== '' && !isSides(Number(typed));

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = tileStep(event.key, index);
    if (next === null) return;
    event.preventDefault();
    setFocusAt(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('button')[next]?.focus();
  };

  return (
    <>
      <span id={labelId} className="atlas-dropdown-swatches__label">{t('diceLab.sides')}</span>
      <div ref={grid} className="atlas-dice-lab__sides-grid" role="group" aria-labelledby={labelId}>
        {PLACES.map(({ sides, span }, index) => {
          const chosen = die.sides === sides;
          return (
            <button key={sides} type="button" className={cn('atlas-dice-lab__side', chosen && 'atlas-selected')}
              style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
              tabIndex={index === tabStop ? 0 : -1}
              aria-pressed={chosen} data-current={chosen || undefined}
              onFocus={() => setFocusAt(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => { setTyped(''); if (!chosen) onChange({ sides }, 'now'); }}>
              <DieStill sides={sides} colour={die.colour} image={image({ sides, colour: die.colour })} height={TILE_DIE} />
              <span className="atlas-dice-lab__side-name">{notation(sides)}</span>
            </button>
          );
        })}
      </div>
      <div className={cn('atlas-dice-lab__other', !common && 'atlas-selected')}>
        <label className="atlas-dice-lab__other-label" htmlFor={inputId}>
          <span className="atlas-dice-lab__other-die" style={{ '--atlas-die-colour': die.colour } as React.CSSProperties} aria-hidden="true">
            {common ? <span className="atlas-dice-lab__other-blank">d?</span> : <PlainDie sides={die.sides} />}
          </span>
          {t('diceLab.otherSides')}
        </label>
        <input id={inputId} type="number" className="atlas-csm-input atlas-dice-lab__number" min={2} max={MAX_SET_SIDES} step={1}
          placeholder="7" data-current={!common || undefined} aria-invalid={invalid || undefined}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            const sides = Number(event.target.value);
            if (event.target.value.trim() !== '' && isSides(sides)) onChange({ sides }, 'typing');
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') onDone(); }} />
      </div>
    </>
  );
}
