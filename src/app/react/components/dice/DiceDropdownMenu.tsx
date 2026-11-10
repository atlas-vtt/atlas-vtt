import React, { useEffect, useRef } from 'react';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { DiceTray, type TrayAdvantage } from './DiceTray';
import { advantageSidesFor, ruledSides } from '../../../tools/diceAdvantage';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { useShareRolls } from '../../hooks/useShareRolls';

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

/** What advantage the collection's dice set offers the tray; undefined where it has no rule. */
function trayAdvantage(diceTool: DiceTool): TrayAdvantage | undefined {
  const rules = diceTool.rollingDice();
  const sides = ruledSides(rules);
  return sides.length > 0 ? { sides, applies: (formula) => advantageSidesFor(formula, rules).length > 0 } : undefined;
}

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef }: DiceDropdownMenuProps): React.ReactElement | null {
  const trayRef = useRef<HTMLDivElement>(null);
  const { app } = useAtlasUI();
  const look = useDiceLook(app ?? undefined);
  const keepInView = useKeepInView(trayRef, isOpen, 'top');
  const shareRolls = useShareRolls();
  // Read as the tray opens: it unmounts when closed, so a set changed meanwhile is read anew.
  const advantage = isOpen ? trayAdvantage(diceTool) : undefined;

  // ── Click-outside ────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (triggerRef?.current?.contains(target)) return;
      if (target.closest('.atlas-dice-tray')) return;
      onToggle();
    };

    // The document the tray is in, and its window's timer.
    const doc = trayRef.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const timer = win.setTimeout(() => {
      doc.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      win.clearTimeout(timer);
      doc.removeEventListener('mousedown', handleClickOutside);
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
          onRoll={(formula, side) => {
            const rolled = side ? diceTool.rollDice(formula, undefined, undefined, { advantage: side }) : diceTool.rollDice(formula);
            if (!rolled) return false;
            onToggle();
            return true;
          }}
          advantage={advantage}
          {...(shareRolls && { shareRolls })}
        />
      </div>
    </div>
  );
}
