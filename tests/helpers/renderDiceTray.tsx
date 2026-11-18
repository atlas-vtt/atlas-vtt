import React, { useState } from 'react';
import { vi } from 'vitest';
import { render, type RenderResult } from '@testing-library/react';
import { DiceTray, type ShareRolls, type TrayAdvantage } from '../../src/app/react/components/dice/DiceTray';
import { emptyTrayMemory, type DiceTrayMemory } from '../../src/app/tools/diceTrayMemory';
import type { TrayCheck } from '../../src/app/react/components/dice/diceTrayStatus';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

export interface TrayHarness {
  view: RenderResult;
  onRoll: ReturnType<typeof vi.fn>;
  onRepeat: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  /** What the tray last asked to keep for its next opening. */
  remembered: () => DiceTrayMemory;
}

interface TrayOptions {
  accepts?: boolean;
  memory?: DiceTrayMemory;
  check?: TrayCheck;
  advantage?: TrayAdvantage;
  shareRolls?: ShareRolls;
  history?: DiceRollResult[];
  historyOpen?: boolean;
}

/** A logged roll as the dice log keeps it, for a tray's history. */
export function loggedRoll(formula: string, total: number, advantage?: DiceRollResult['advantage']): DiceRollResult {
  return { id: `${formula}-${total}-${Math.random()}`, timestamp: Date.now(), formula, rolls: [], modifiers: 0, total, ...(advantage && { advantage }) };
}

/** The tray with its dice tool's parts stood in for: rolls accepted (or refused) and every formula the parser takes allowed. */
export function renderDiceTray({ accepts = true, memory = emptyTrayMemory(), check = () => null, advantage, shareRolls, history = [], historyOpen = false }: TrayOptions = {}): TrayHarness {
  let kept = memory;
  const onRoll = vi.fn(() => accepts);
  const onRepeat = vi.fn(() => accepts);
  // Closing unmounts the tray, as the dropdown does: what it keeps must be kept before that.
  const onClose = vi.fn(() => view.unmount());
  function Harness(): React.ReactElement {
    const [open, setOpen] = useState(historyOpen);
    return (
      <DiceTray
        memory={memory}
        onRemember={(next) => { kept = next; }}
        check={check}
        onRoll={onRoll}
        history={history}
        onRepeat={onRepeat}
        historyOpen={open}
        onHistoryOpen={setOpen}
        onClose={onClose}
        mapKeys={() => true}
        advantage={advantage}
        shareRolls={shareRolls}
      />
    );
  }
  const view: RenderResult = render(<Harness />);
  return { view, onRoll, onRepeat, onClose, remembered: () => kept };
}
