import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Dices, Pin, PinOff, Trash2 } from 'lucide-react';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { useDiceHistory } from './useDiceHistory';
import { DiceRollEntry } from './DiceRollEntry';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import type { DiceTool } from '../../../tools/DiceTool';
import { t } from '../../../i18n';

interface DiceRollLogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DiceRollLog({ isOpen, onClose }: DiceRollLogProps): React.ReactElement | null {
  const { view } = useAtlasUI();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const [isPinned, setIsPinned] = useState(false);

  // Store bindings for persistence
  const diceLog = useAtlasStore(state => state.diceLog);
  const addDiceLogEntry = useAtlasStore(state => state.addDiceLogEntry);
  const clearDiceLog = useAtlasStore(state => state.clearDiceLog);

  const storeActions = useMemo(() => ({
    diceLog, addDiceLogEntry, clearDiceLog,
  }), [diceLog, addDiceLogEntry, clearDiceLog]);

  const getDiceTool = useCallback((): DiceTool | null => {
    try {
      return view?.serviceManager?.getToolController?.()?.getDiceTool?.() ?? null;
    } catch {
      return null;
    }
  }, [view]);

  const { history, clearHistory, repeatRoll } = useDiceHistory(getDiceTool, storeActions, view?.serviceManager?.getEventBus());

  const handleClose = useCallback((): void => {
    setIsPinned(false);
    onClose();
  }, [onClose]);

  // Auto-scroll to top when new roll arrives (newest at top)
  useEffect(() => {
    if (history.length > prevLengthRef.current && listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevLengthRef.current = history.length;
  }, [history.length]);

  // Close on click outside (disabled when pinned)
  useEffect(() => {
    if (!isOpen || isPinned) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isPinned, onClose]);

  // Close on Escape (disabled when pinned)
  useEffect(() => {
    if (!isOpen || isPinned) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isPinned, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="dice-roll-log">
      {/* Header */}
      <div className="dice-roll-log__header">
        <span className="dice-roll-log__title">{t('dice.log')}</span>
        <div className="dice-roll-log__actions">
          {history.length > 0 && (
            <LabelTooltip label={t('dice.clearHistory')}>
              <button
                className="btn btn--ghost btn--icon dice-roll-log__action-btn"
                onClick={clearHistory}
              >
                <Trash2 />
              </button>
            </LabelTooltip>
          )}
          <LabelTooltip label={isPinned ? t('dice.unpin') : t('dice.pin')}>
            <button
              className={`btn btn--ghost btn--icon dice-roll-log__action-btn ${isPinned ? 'dice-roll-log__action-btn--active' : ''}`}
              onClick={() => setIsPinned(prev => !prev)}
            >
              {isPinned ? <PinOff /> : <Pin />}
            </button>
          </LabelTooltip>
          <CloseButton onClick={handleClose} title={t('dice.closeHint')} />
        </div>
      </div>

      {/* Scrollable list */}
      <div ref={listRef} className="dice-roll-log__list">
        {history.length === 0 ? (
          <div className="dice-roll-log__empty">
            <Dices className="dice-roll-log__empty-icon" />
            <span>{t('dice.noRolls')}</span>
          </div>
        ) : (
          history.map((result, index) => (
            <DiceRollEntry
              key={result.id}
              result={result}
              isNew={index === 0 && history.length > prevLengthRef.current}
              onRepeat={() => repeatRoll(result.formula, result.source)}
            />
          ))
        )}
      </div>
    </div>
  );
}
