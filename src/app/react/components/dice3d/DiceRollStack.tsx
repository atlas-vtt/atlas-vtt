import React from 'react';
import { DiceRollPanel } from './DiceRollPanel';
import { largeRollIndex, type StackedRoll } from './rollStackState';
import type { UseDiceAvatar } from '../dice/diceSourcePresentation';

interface DiceRollStackProps {
  /** Oldest first, the reading order of the stack. */
  rolls: readonly StackedRoll[];
  muted: boolean;
  onClose: (id: string) => void;
  onDone: (id: string) => void;
  /** Finds each roller's portrait. */
  useAvatar: UseDiceAvatar;
}

/**
 * The column of 3D rolls: the newest large, older ones shrunk to rows above it.
 * No `AnimatePresence`: fading out belongs to the stack state (`leaving`) and
 * removal to each panel's timer, since presence never removed panels while
 * rolls kept coming faster than a fade.
 */
export function DiceRollStack({ rolls, muted, onClose, onDone, useAvatar }: DiceRollStackProps): React.ReactElement {
  const large = largeRollIndex(rolls);
  return (
    <>
      {rolls.map((roll, i) => (
        // The key makes a second roll a new panel; the old one would keep its number otherwise.
        <DiceRollPanel
          key={roll.result.id}
          result={roll.result}
          presentation={roll.sourcePresentation}
          scene={roll.scene}
          style={roll.style}
          compact={i !== large}
          leaving={roll.leaving === true}
          muted={muted}
          onClose={() => onClose(roll.result.id)}
          onDone={() => onDone(roll.result.id)}
          useAvatar={useAvatar}
        />
      ))}
    </>
  );
}
