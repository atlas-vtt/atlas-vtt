import type { EventEmitter } from 'events';
import { useState, useEffect, useCallback } from 'react';
import type { DiceRollResult } from '../../../tools/DiceTool';

const MAX_HISTORY = 20;

/**
 * Subscribes to dice roll events and provides a reactive history array.
 * Seeds from the store's persisted `diceLog` on mount, syncs new rolls
 * back to the store for persistence across map close/reopen.
 */
export function useDiceHistory(
  getDiceTool: () => { rollDice: (formula: string, source?: DiceRollResult['source']) => DiceRollResult | null; clearHistory: () => void } | null,
  storeActions?: {
    diceLog: DiceRollResult[];
    addDiceLogEntry: (entry: DiceRollResult) => void;
    clearDiceLog: () => void;
  },
  eventBus?: EventEmitter,
): {
  history: DiceRollResult[];
  clearHistory: () => void;
  repeatRoll: (formula: string, source?: DiceRollResult['source']) => void;
} {
  const [history, setHistory] = useState<DiceRollResult[]>(() =>
    storeActions?.diceLog ?? [],
  );

  // Re-seed when store's diceLog changes (e.g. map switch / hydration)
  useEffect(() => {
    if (storeActions?.diceLog) {
      setHistory(storeActions.diceLog);
    }
  }, [storeActions?.diceLog]);

  // Listen only to the view that owns this history.
  useEffect(() => {
    const handleRoll = (result: DiceRollResult): void => {
      setHistory(prev => {
        const next = [result, ...prev];
        return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
      });
      // Persist to store so it survives map close/reopen
      storeActions?.addDiceLogEntry(result);
    };

    const handleClear = (): void => {
      setHistory([]);
      storeActions?.clearDiceLog();
    };

    eventBus?.on('dice-rolled', handleRoll);
    eventBus?.on('dice-history-cleared', handleClear);
    return () => {
      eventBus?.off('dice-rolled', handleRoll);
      eventBus?.off('dice-history-cleared', handleClear);
    };
  }, [storeActions, eventBus]);

  const clearHistory = useCallback((): void => {
    getDiceTool()?.clearHistory();
  }, [getDiceTool]);

  const repeatRoll = useCallback((formula: string, source?: DiceRollResult['source']): void => {
    const diceTool = getDiceTool();
    if (diceTool) {
      diceTool.rollDice(formula, source);
    }
  }, [getDiceTool]);

  return { history, clearHistory, repeatRoll };
}
