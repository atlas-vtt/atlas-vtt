import React, { useEffect, useRef, useState } from 'react';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { DiceTray } from './DiceTray';
import { trayPoolByDie } from './diceTrayPool';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { useDiceColours } from './useDiceColours';
import { useShareRolls } from '../../hooks/useShareRolls';

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Rolls the tray elsewhere instead of with `diceTool`, with the dice keyed by name (`d20`). Return null once it went; else why it could not, shown in the tray, which stays open. */
  onRoll?: (dice: Readonly<Record<string, number>>, modifier: number) => string | null;
  /** The most dice the tray lets the player pick; the tray's own limit when unset. */
  maxDice?: number;
}

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef, onRoll, maxDice }: DiceDropdownMenuProps): React.ReactElement | null {
  const trayRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const { app } = useAtlasUI();
  const look = useDiceLook(app ?? undefined);
  const keepInView = useKeepInView(trayRef, isOpen, 'top');
  // A tray that rolls elsewhere (`onRoll`, a remote view's) has no way to carry colours.
  const colours = useDiceColours(app ?? null, isOpen && !onRoll);
  const shareRolls = useShareRolls();

  // ── Click-outside ────────────────────────────

  useEffect(() => {
    if (!isOpen) setNote(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (triggerRef?.current?.contains(target)) return;
      if (target.closest('.atlas-dice-tray')) return;
      onToggle();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle, triggerRef]);

  // Hangs from its toolbar button inside the map view, like the other toolbar
  // dropdowns: it stays in the view's stacking order, so the DM dashboard and
  // the asset manager cover it. Closed, the tray unmounts and forgets its dice.
  if (!isOpen) return null;
  return (
    <div
      ref={trayRef}
      className={cn('atlas-dice-tray', diceFontClass(look), keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
    >
      <div className="atlas-dice-panel">
        <DiceTray
          onChange={() => setNote(null)}
          {...(maxDice !== undefined ? { maxDice } : {})}
          colours={colours}
          onRoll={(formula, pool, modifier, tags) => {
            if (onRoll) {
              const problem = onRoll(trayPoolByDie(pool), modifier);
              if (problem !== null) {
                setNote(problem);
                return false;
              }
            } else if (!(tags.some((tag) => tag !== null) ? diceTool.rollDice(formula, undefined, undefined, tags) : diceTool.rollDice(formula))) return false;
            onToggle();
            return true;
          }}
          {...(shareRolls && { shareRolls })}
        />
        {note && <div className="atlas-dice-note" role="status">{note}</div>}
      </div>
    </div>
  );
}
