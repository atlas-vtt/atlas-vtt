import React, { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { emptyTrayMemory, type DiceTrayMemory, type TrayRoll } from '../../../tools/diceTrayMemory';
import type { DiceRollResult } from '../../../types/diceTypes';
import { DiceTrayAdvantage, SIDE_KEYS } from './DiceTrayAdvantage';
import { DiceTrayDice } from './DiceTrayDice';
import { DiceTrayFormula } from './DiceTrayFormula';
import { DiceTrayModifier } from './DiceTrayModifier';
import { DiceTrayHistoryList, DiceTrayHistoryToggle, historyTitle } from './DiceTrayHistory';
import { MAX_DICE, MAX_PER_DIE, TRAY_DICE, TRAY_SURFACE, TRAY_TOOLTIP_GAP, clampModifier, diceCounts, trayDiceCount, writeTray, type TrayDie } from './diceTrayPool';
import { modifierOf, parseableFormula, withDie, withModifier } from './diceTrayText';
import { advantageMoot, rollSide, statusMessage, trayStatus, type TrayAdvantage, type TrayCheck } from './diceTrayStatus';
import { stopMapKeys, useDiceTrayKeys } from './useDiceTrayKeys';
import { useSpokenOnce } from './useSpokenOnce';
import { t } from '../../../i18n';

export type { TrayAdvantage } from './diceTrayStatus';

/** The GM's switch for whether players see their rolls (`useShareRolls`). */
export interface ShareRolls {
  shown: boolean;
  onToggle: () => void;
}

interface DiceTrayProps {
  /** What the tray held when it last closed. */
  memory: DiceTrayMemory;
  /** Keeps what the tray holds for when it opens again. */
  onRemember: (memory: DiceTrayMemory) => void;
  /** The dice tool's check: whether a roll would be refused, and why. */
  check: TrayCheck;
  /** Rolls through the dice tool; false where the roll was refused. */
  onRoll: (roll: TrayRoll) => boolean;
  /** The dice log's rolls, newest first (the view store's `diceLog`): the tray's roll history. */
  history: readonly DiceRollResult[];
  /** Rolls a logged roll again as it was rolled; false where it was refused. */
  onRepeat: (entry: DiceRollResult) => boolean;
  /** Whether the roll history stands open (remembered by whoever holds the tray). */
  historyOpen: boolean;
  onHistoryOpen: (open: boolean) => void;
  /** Closes the tray: Escape, and a roll of what it held. */
  onClose: () => void;
  /**
   * Whether a key pressed outside a text field may act as the map's would (the map view in front, no dialog
   * over it): then Enter outside the tray rolls, and the tray's keys (N A D, + −) work. Left out, none do.
   */
  mapKeys?: (event: KeyboardEvent) => boolean;
  /** The GM's switch for whether players see their rolls; left out where nobody else watches. */
  shareRolls?: ShareRolls | undefined;
  /** Left out where the set has no rule for either side. */
  advantage?: TrayAdvantage | undefined;
}

/** How long clicks and keys must rest before the tray says what it holds. */
const ANNOUNCE_REST_MS = 500;

/** A timeout set on the tray's own window (a popout has its own). */
interface WindowTimer {
  win: Window;
  id: number;
}

function cancelTimer(timer: WindowTimer | null): void {
  if (timer) timer.win.clearTimeout(timer.id);
}

/**
 * Seven bodies to click, a modifier and a formula field they write into, which
 * takes a formula typed for itself (`4d6kh3 + 2`), checked as it is typed. What
 * it holds stays while the tray closes; a roll of it empties it, the modifier
 * and advantage too: one left standing is the mistake nobody sees, carried into
 * the next roll. Shift-click rolls a single die at once, and the roll history
 * (the dice log's rolls) rolls an earlier roll again.
 */
export function DiceTray({ memory, onRemember, check, onRoll, history, onRepeat, historyOpen, onHistoryOpen, onClose, mapKeys, shareRolls, advantage }: DiceTrayProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const historyId = useId();
  const shareId = useId();
  const [held, setHeld] = useState<DiceTrayMemory>(memory);
  // What the tray holds now, said once a burst of clicks or keys has rested (never per keypress in the field).
  const [announced, setAnnounced] = useState('');
  const announceTimer = useRef<WindowTimer | null>(null);
  // What Clear took away, offered back by Restore in the message line until the dice or the side change again.
  const [cleared, setCleared] = useState<DiceTrayMemory | null>(null);

  // Each change reads the tray as it is when it lands (quick clicks in one task each count) and is kept at
  // once, not in a state updater: a roll closes the tray, which unmounts before a queued updater would run.
  const latest = useRef(held);
  const edit = (change: (before: DiceTrayMemory) => Partial<DiceTrayMemory>): void => {
    const patch = change(latest.current);
    const next = { ...latest.current, ...patch };
    if ('formula' in patch || 'side' in patch) setCleared(null);
    latest.current = next;
    onRemember(next);
    setHeld(next);
  };
  const keep = (patch: Partial<DiceTrayMemory>): void => edit(() => patch);

  /** A change made by a click or key outside the field: its new formula is announced politely once it rests. */
  const announce = (): void => {
    const win = rootRef.current?.ownerDocument.defaultView ?? window;
    cancelTimer(announceTimer.current);
    const id = win.setTimeout(() => {
      announceTimer.current = null;
      const now = latest.current.formula.trim();
      setAnnounced(now === '' ? t('diceRoll.announceEmpty') : t('diceRoll.announceTray', { formula: now }));
    }, ANNOUNCE_REST_MS);
    announceTimer.current = { win, id };
  };
  const editAnnounced = (change: (before: DiceTrayMemory) => Partial<DiceTrayMemory>): void => {
    edit(change);
    announce();
  };
  useEffect(() => () => cancelTimer(announceTimer.current), []);

  const { formula, side } = held;
  const counts = diceCounts(formula);
  const status = trayStatus(formula, side, advantage, check);
  const moot = advantageMoot(formula, advantage);
  const message = statusMessage(status, counts);
  const spokenMessage = useSpokenOnce(message, ANNOUNCE_REST_MS);
  const canClear = formula.trim() !== '' || side !== 'normal';

  const roll = (made: TrayRoll): boolean => onRoll({ formula: parseableFormula(made.formula), advantage: made.advantage });

  /** A logged roll again (a history row, or the newest): it closes the tray as Roll does; only Shift-click keeps it open. */
  const rollAgain = (entry: DiceRollResult): boolean => {
    if (!onRepeat(entry)) return false;
    onClose();
    return true;
  };

  // An empty tray with a roll history rolls the newest again: with Enter, and with Roll, which says so.
  const again = status.kind === 'empty' ? history[0] : undefined;

  /** Rolls what the tray holds; an empty tray rolls its newest recent roll again. */
  const throwDice = (): boolean => {
    if (again) return rollAgain(again);
    if (status.kind !== 'ready' || !roll({ formula, advantage: status.advantage })) return false;
    keep(emptyTrayMemory());
    onClose();
    return true;
  };

  const rollNow = (sides: TrayDie): void => {
    const single = writeTray({ pool: { [sides]: 1 }, modifier: modifierOf(formula) });
    roll({ formula: single, advantage: rollSide(single, side, advantage) });
  };

  const addDie = (sides: TrayDie): void => editAnnounced((before) => {
    const held = diceCounts(before.formula);
    return (held[sides] ?? 0) >= MAX_PER_DIE || trayDiceCount(held) >= MAX_DICE ? {} : { formula: withDie(before.formula, sides, 1) };
  });

  const step = (delta: 1 | -1): void =>
    editAnnounced((before) => ({ formula: withModifier(before.formula, clampModifier(modifierOf(before.formula) + delta)) }));

  const clear = (): void => {
    const was = latest.current;
    keep(emptyTrayMemory());
    announce();
    if (was.formula.trim() !== '') setCleared(was);
  };

  const restore = (): void => {
    if (!cleared) return;
    keep(cleared);
    announce();
  };

  /**
   * The tray's own keys: the number keys add the dice by their place in the row (1 is the first), `/` puts
   * the caret in the formula field, S switches showing the rolls to players, N, A and D choose the side, + and
   * − step the modifier.
   */
  const shortcut = (key: string): boolean => {
    const place = /^[1-9]$/.test(key) ? TRAY_DICE[Number(key) - 1] : undefined;
    if (place !== undefined) addDie(place);
    else if (key === '/') fieldRef.current?.focus();
    else if (key === 's' && shareRolls) shareRolls.onToggle();
    else if (key === '+' || key === '=') step(1);
    else if (key === '-' || key === '\u2212') step(-1);
    else {
      const choice = advantage && (Object.keys(SIDE_KEYS) as (keyof typeof SIDE_KEYS)[]).find((value) => SIDE_KEYS[value] === key);
      if (!choice || (choice !== 'normal' && !advantage.sides.includes(choice))) return false;
      keep({ side: choice });
    }
    return true;
  };

  useDiceTrayKeys(rootRef, {
    onClose,
    mapKeys: (event) => mapKeys?.(event) ?? false,
    onEnter: () => throwDice(),
    onShortcut: shortcut,
  });

  const restoring = cleared !== null && status.kind === 'empty';

  return (
    <div ref={rootRef} className="atlas-dice-tray__content" onKeyDown={stopMapKeys}>
      {/* In a short window this part scrolls; Roll and Clear stay at the foot, in view. */}
      <div className="atlas-dice-tray__scroll">
        <DiceTrayDice
          counts={counts}
          onAdd={addDie}
          onTakeBack={(sides) => editAnnounced((before) => ({ formula: withDie(before.formula, sides, -1) }))}
          onRollNow={rollNow}
        />

        <div className="atlas-dice-tray__group">
          {/* What to roll and what to add, side by side: the formula takes the room, the modifier its number. */}
          <div className="atlas-dice-tray__entry">
            <DiceTrayFormula
              ref={fieldRef}
              value={formula}
              onChange={(text) => keep({ formula: text })}
              onEnter={() => { throwDice(); }}
              invalid={status.kind === 'invalid'}
              describedBy={messageId}
            />
            <DiceTrayModifier
              value={modifierOf(formula)}
              onChange={(modifier) => editAnnounced((before) => ({ formula: withModifier(before.formula, modifier) }))}
              onStep={step}
            />
          </div>
          <p id={messageId} className={cn('atlas-dice-tray__message', status.kind === 'invalid' && 'atlas-dice-tray__message--error')}>
            {restoring ? (
              <>
                {t('diceRoll.trayCleared')}
                {' · '}
                <button type="button" className="atlas-dice-tray__restore" onClick={restore}>{t('diceRoll.restore')}</button>
              </>
            ) : message}
          </p>
        </div>

        {advantage && (
          <DiceTrayAdvantage advantage={advantage} side={side} moot={moot} onChange={(value) => keep({ side: value })} />
        )}

        <div className="atlas-dice-tray__group atlas-dice-tray__group--history">
          {/* The history's toggle and the share switch share one row; the list unfolds under it, above Roll. */}
          <div className="atlas-dice-tray__bar">
            <DiceTrayHistoryToggle count={history.length} open={historyOpen} onToggle={() => onHistoryOpen(!historyOpen)} listId={historyId} />
            {shareRolls && (
              <div className="atlas-dice-tray__share">
                {/* Short on the row; the switch's name and tooltip say it whole. */}
                <span className="atlas-dice-tray__share-label" aria-hidden="true" onClick={shareRolls.onToggle}>{t('diceRoll.showToPlayers')}</span>
                <span id={shareId} hidden>{t('dice.showRollsToPlayers')}</span>
                <LabelTooltip label={t('dice.showRollsToPlayers')} shortcut="S" outside={TRAY_SURFACE} side="right" sideOffset={TRAY_TOOLTIP_GAP}>
                  <ToggleSwitch value={shareRolls.shown} onChange={shareRolls.onToggle} labelledBy={shareId} />
                </LabelTooltip>
              </div>
            )}
          </div>
          <DiceTrayHistoryList
            history={history}
            listId={historyId}
            open={historyOpen}
            onRepeat={(entry) => { rollAgain(entry); }}
            enterRepeatsNewest={status.kind === 'empty'}
          />
        </div>

        {/* Always present: a region that appears with its content goes unheard by screen readers. */}
        <span className="atlas-dice-tray__announce" aria-live="polite">{announced}</span>
        <span className="atlas-dice-tray__announce" role="status" aria-live="polite">{spokenMessage}</span>
      </div>

      {/* Roll carries its key on its face (↵): a tooltip over it covered the rows above. */}
      <div className="atlas-dice-tray__actions">
        <Button className="atlas-dice-tray__roll" onClick={throwDice} disabled={status.kind !== 'ready' && !again} aria-keyshortcuts="Enter">
          <span className="atlas-dice-tray__roll-label">{again ? t('diceRoll.rollAgain', { formula: historyTitle(again) }) : t('diceRoll.roll')}</span>
          <kbd className="atlas-dice-tray__roll-key" aria-hidden="true">↵</kbd>
        </Button>
        <Button variant="ghost" className="atlas-dice-tray__clear" onClick={clear} disabled={!canClear}>
          {t('diceRoll.clear')}
        </Button>
      </div>
    </div>
  );
}
