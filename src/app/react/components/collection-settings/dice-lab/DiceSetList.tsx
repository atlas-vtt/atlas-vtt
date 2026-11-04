import React, { useEffect, useRef, useState } from 'react';
import { Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { setRollText } from '../../../../gameSystems/diceSets';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { DiceSet } from '../../../../types/diceSetTypes';
import { scrollWithin } from '../../../../utils/scrollWithin';
import { t } from '../../../../i18n';

interface DiceSetListProps {
  sets: readonly DiceSet[];
  /** The set open in the lab; null while a new set is begun. */
  selectedId: string | null;
  /** The name of the new set being begun, shown first while it has no dice. */
  newSetName: string | null;
  /** Whether sets can be made and deleted: the vault's library is open. */
  canEdit: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (set: DiceSet) => void;
  onDelete: (set: DiceSet) => void;
}

/** What a set rolls, where its name does not say it, and whether it is built in: `d12 + d12`, `2d10 · Built-in`. */
export function setDetail(set: DiceSet): string {
  const roll = setRollText(set.dice);
  const parts = [...(roll === set.name ? [] : [roll]), ...(set.builtIn ? [t('diceLab.builtIn')] : [])];
  return parts.join(' · ');
}

/** A set's dice as dots before its name, one per kind of die: its colour, or a ring for the dice look. */
function SetDots({ set }: { set: DiceSet }): React.ReactElement {
  const colours = [...new Set(set.dice.map((group) => group.colour ?? ''))].slice(0, 3);
  return (
    <span className="atlas-dice-lab__dots" aria-hidden="true">
      {colours.map((colour) => (
        <span key={colour} className={cn('atlas-dice-lab__dot', !colour && 'atlas-plain')}
          style={colour ? { '--atlas-die-colour': colour } as React.CSSProperties : undefined} />
      ))}
    </span>
  );
}

/** Moves focus to the row above or below with the arrow keys. */
function moveFocus(event: React.KeyboardEvent<HTMLElement>): void {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (step === 0) return;
  const rows = [...(event.currentTarget.querySelectorAll<HTMLButtonElement>('.atlas-dice-lab__set'))];
  const at = rows.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement);
  if (at < 0) return;
  event.preventDefault();
  rows[Math.max(0, Math.min(rows.length - 1, at + step))]?.focus();
}

/**
 * The vault's dice sets in the lab's sidebar: built-in sets first, each with
 * a lock, then the vault's own. A row's actions show while it is hovered,
 * focused or open; deleting asks a second press.
 */
export function DiceSetList(props: DiceSetListProps): React.ReactElement {
  const { sets, selectedId, newSetName, canEdit, onSelect, onCreate, onDuplicate, onDelete } = props;
  const [confirming, setConfirming] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // The open set stays in view: a new set, a copy just made, the set the lab opened on
  const openKey = newSetName !== null ? 'new' : selectedId;
  useEffect(() => {
    const row = list.current?.querySelector('[aria-current="true"]');
    if (list.current && row) scrollWithin(list.current, row, 'nearest');
  }, [openKey]);

  const remove = (set: DiceSet): void => {
    if (confirming !== set.id) {
      setConfirming(set.id);
      return;
    }
    setConfirming(null);
    onDelete(set);
  };

  return (
    <div className="atlas-dice-lab__library">
      <div className="atlas-dice-lab__library-head">
        <span className="atlas-dice-lab__section-label">{t('diceLab.sets')}</span>
        {canEdit && (
          <LabelTooltip label={t('diceLab.newSet')}>
            <Button variant="ghost" size="icon" className="atlas-dice-lab__icon-btn" onClick={onCreate}>
              <Plus />
            </Button>
          </LabelTooltip>
        )}
      </div>
      <ul ref={list} className="atlas-dice-lab__sets" aria-label={t('diceLab.sets')} onKeyDown={moveFocus}>
        {sets.map((set) => {
          const open = set.id === selectedId;
          const asking = confirming === set.id;
          return (
            <li key={set.id} className={cn('atlas-dice-lab__set-row', open && 'atlas-selected', asking && 'atlas-asking')}
              onMouseLeave={() => { if (asking) setConfirming(null); }}>
              <button type="button" className="atlas-dice-lab__set" aria-current={open || undefined} onClick={() => onSelect(set.id)}>
                <SetDots set={set} />
                <span className="atlas-dice-lab__set-name">{set.name}</span>
                <span className="atlas-dice-lab__set-detail">{setRollText(set.dice) === set.name ? '' : setRollText(set.dice)}</span>
                {set.builtIn && (
                  <>
                    <Lock className="atlas-dice-lab__lock" aria-hidden="true" />
                    <span className="atlas-dice-lab__hidden-text">{t('diceLab.builtIn')}</span>
                  </>
                )}
              </button>
              {canEdit && (
                <span className="atlas-dice-lab__set-actions">
                  <LabelTooltip label={t('diceLab.duplicateSet', { name: set.name })}>
                    <Button variant="ghost" size="icon" className="atlas-dice-lab__icon-btn" onClick={() => onDuplicate(set)}>
                      <Copy />
                    </Button>
                  </LabelTooltip>
                  {!set.builtIn && (
                    <LabelTooltip label={asking ? t('diceLab.confirmDelete', { name: set.name }) : t('diceLab.deleteSet', { name: set.name })}>
                      <Button variant={asking ? 'destructive' : 'ghost'} size="icon" className="atlas-dice-lab__icon-btn"
                        onClick={() => remove(set)} onBlur={() => { if (asking) setConfirming(null); }}>
                        <Trash2 />
                      </Button>
                    </LabelTooltip>
                  )}
                </span>
              )}
            </li>
          );
        })}
        {newSetName !== null && (
          <li className="atlas-dice-lab__set-row atlas-selected">
            <button type="button" className="atlas-dice-lab__set" aria-current="true">
              <span className="atlas-dice-lab__dots" aria-hidden="true" />
              <span className="atlas-dice-lab__set-name">{newSetName}</span>
              <span className="atlas-dice-lab__set-detail">{t('diceLab.noDiceYet')}</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
