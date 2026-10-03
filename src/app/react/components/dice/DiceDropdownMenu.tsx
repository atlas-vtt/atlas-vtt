import React, { useEffect, useRef } from 'react';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { DiceTray } from './DiceTray';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { useSecretRoll } from '../../hooks/useSecretRoll';
import { useShowDiceRolls } from '../../hooks/useShowDiceRolls';

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef }: DiceDropdownMenuProps): React.ReactElement | null {
  const trayRef = useRef<HTMLDivElement>(null);
  const { app } = useAtlasUI();
  const look = useDiceLook(app ?? undefined);
  const secretRoll = useSecretRoll(diceTool);
  const showDiceRolls = useShowDiceRolls(app ?? undefined);
  const keepInView = useKeepInView(trayRef, isOpen, 'top');

  // ── Click-outside ────────────────────────────

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
          onRoll={(formula) => {
            diceTool.rollDice(formula, undefined, { secret: diceTool.state.secretRoll });
            onToggle();
          }}
          secretRoll={secretRoll}
          onSecretRollChange={(on) => diceTool.setSecretRoll(on)}
          secretRollAvailable={showDiceRolls}
        />
      </div>
    </div>
  );
}
