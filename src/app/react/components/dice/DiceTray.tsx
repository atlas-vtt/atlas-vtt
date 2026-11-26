import React, { useId, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { emptyTrayMemory, type DiceTrayMemory, type TrayRoll } from '../../../tools/diceTrayMemory';
import type { DicePreset, DiceRowSlot } from '../../../types/dicePresetTypes';
import type { AdvantageSide } from '../../../types/diceSetTypes';
import type { DiceRollResult } from '../../../types/diceTypes';
import { DiceTrayAdvantage, SIDE_KEYS } from './DiceTrayAdvantage';
import { DiceTrayDice } from './DiceTrayDice';
import { DiceRowEditor } from './DiceRowEditor';
import { DiceTrayActions } from './DiceTrayActions';
import { DiceTrayShare, type ShareRolls } from './DiceTrayShare';
import { designedPreset, rowDiceCounts, slotAlone, withSlot } from './diceTraySlots';
import { STANDARD_ROW, STANDARD_ROW_CHANGE, type DiceShelf, type ShelfChange } from './diceShelf';
import { DiceTrayFormula } from './DiceTrayFormula';
import { DiceTrayModifier } from './DiceTrayModifier';
import { DiceTrayHistoryList, DiceTrayHistoryToggle, historyTitle } from './DiceTrayHistory';
import { clampModifier } from './diceTrayPool';
import { modifierOf, parseableFormula, withModifier } from './diceTrayText';
import { advantageMoot, rollSide, statusMessage, trayStatus, type TrayAdvantage, type TrayCheck } from './diceTrayStatus';
import { stopMapKeys, useDiceTrayKeys } from './useDiceTrayKeys';
import { useSpokenOnce } from './useSpokenOnce';
import { ANNOUNCE_REST_MS, useTrayAnnouncement } from './useTrayAnnouncement';
import { t } from '../../../i18n';

export type { TrayAdvantage } from './diceTrayStatus';

export type { ShareRolls } from './DiceTrayShare';

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
  /** The collection's saved rolls and dice row (`diceShelf.ts`); left out, the seven standard dice. */
  shelf?: DiceShelf | undefined;
  /** Writes a change of the row; left out where it cannot change (a scene in no collection): no edit mode then. */
  onShelfChange?: ((change: ShelfChange) => void) | undefined;
  /** Tells whoever holds the tray what it holds now, as it changes (the saved rolls' panel saves it). */
  onFormula?: ((formula: string) => void) | undefined;
  /** Rolls a saved roll whose dice are designed (`look`) at once, with the side of advantage the tray holds. */
  onRollPreset?: ((preset: DicePreset, side: AdvantageSide | null) => void) | undefined;
  /** The saved rolls' panel: whether it stands open, and its switch (P). Left out where there is none. */
  presetsPanel?: { open: boolean; onToggle: () => void } | undefined;
}


/**
 * Seven bodies to click, a modifier and a formula field they write into, which
 * takes a formula typed for itself (`4d6kh3 + 2`), checked as it is typed. What
 * it holds stays while the tray closes; a roll of it empties it, the modifier
 * and advantage too: one left standing is the mistake nobody sees, carried into
 * the next roll. Shift-click rolls a single die at once, and the roll history
 * (the dice log's rolls) rolls an earlier roll again.
 */
export function DiceTray({
  memory, onRemember, check, onRoll, history, onRepeat, historyOpen, onHistoryOpen, onClose, mapKeys, shareRolls, advantage,
  shelf, onShelfChange, onFormula, onRollPreset, presetsPanel,
}: DiceTrayProps): React.ReactElement {
  const row = shelf?.row ?? STANDARD_ROW;
  const presets = shelf?.presets ?? [];
  // The row's edit mode: its dice wiggle and can be moved, taken out and added (`DiceRowEditor`).
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const historyId = useId();
  const [held, setHeld] = useState<DiceTrayMemory>(memory);
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
    if ('formula' in patch) onFormula?.(next.formula);
    setHeld(next);
  };
  const keep = (patch: Partial<DiceTrayMemory>): void => edit(() => patch);

  // A change made by a click or key outside the field: its new formula is announced politely once it rests.
  const { announced, announce } = useTrayAnnouncement(rootRef, () => latest.current.formula);
  const editAnnounced = (change: (before: DiceTrayMemory) => Partial<DiceTrayMemory>): void => {
    edit(change);
    announce();
  };

  const { formula, side } = held;
  // The row's dice count only their own: the dice of a saved roll in the tray belong to that roll.
  const counts = rowDiceCounts(formula, presets);
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

  /** A designed roll in the row rolls at once, whatever the tray holds: its dice are its own set. */
  const rolledDesigned = (slot: DiceRowSlot): boolean => {
    const preset = designedPreset(slot, presets);
    if (!preset) return false;
    onRollPreset?.(preset, side === 'normal' ? null : side);
    return true;
  };

  const rollNow = (slot: DiceRowSlot): void => {
    if (rolledDesigned(slot)) return;
    const single = slotAlone(formula, slot, presets);
    if (single !== null) roll({ formula: single, advantage: rollSide(single, side, advantage) });
  };
  const addSlot = (slot: DiceRowSlot): void => {
    if (!rolledDesigned(slot)) editAnnounced((before) => ({ formula: withSlot(before.formula, slot, presets, 1) }));
  };
  const takeBack = (slot: DiceRowSlot): void => editAnnounced((before) => ({ formula: withSlot(before.formula, slot, presets, -1) }));

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
   * The tray's own keys: the number keys add the row's dice and saved rolls by their place (1 is the first, 0
   * the tenth), `/` puts the caret in the formula field, S switches showing the rolls to players, P the saved
   * rolls' panel, E the row's edit mode, N, A and D choose the side, + and − step the modifier. While the row is
   * edited only E works, Escape ends the edit and Enter rolls nothing.
   */
  const shortcut = (key: string): boolean => {
    if (key === 'e' && onShelfChange) {
      setEditing(!editing);
      return true;
    }
    if (editing) return false;
    const place = /^[0-9]$/.test(key) ? row[(Number(key) + 9) % 10] : undefined;
    if (place !== undefined) addSlot(place);
    else if (key === '/') fieldRef.current?.focus();
    else if (key === 's' && shareRolls) shareRolls.onToggle();
    else if (key === 'p' && presetsPanel) presetsPanel.onToggle();
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
    onClose: () => (editing ? setEditing(false) : onClose()),
    mapKeys: (event) => mapKeys?.(event) ?? false,
    onEnter: () => !editing && throwDice(),
    onShortcut: shortcut,
  });

  const restoring = cleared !== null && status.kind === 'empty';

  return (
    <div ref={rootRef} className="atlas-dice-tray__content" onKeyDown={stopMapKeys}>
      {/* In a short window this part scrolls; Roll and Clear stay at the foot, in view. */}
      <div className="atlas-dice-tray__scroll">
        {editing && shelf && onShelfChange
          ? <DiceRowEditor shelf={shelf} onChange={onShelfChange} />
          : <DiceTrayDice row={row} presets={presets} formula={formula} counts={counts} onAdd={addSlot} onTakeBack={takeBack} onRollNow={rollNow} />}

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
            {shareRolls && <DiceTrayShare shareRolls={shareRolls} />}
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

      <DiceTrayActions
        rollLabel={again ? t('diceRoll.rollAgain', { formula: historyTitle(again) }) : t('diceRoll.roll')}
        canRoll={status.kind === 'ready' || again !== undefined}
        onRoll={() => { throwDice(); }}
        canClear={canClear}
        onClear={clear}
        presetsPanel={presetsPanel}
        rowEdit={onShelfChange && {
          editing,
          onToggle: () => setEditing(!editing),
          onStandard: shelf?.ownRow ? () => onShelfChange(STANDARD_ROW_CHANGE) : null,
        }}
      />
    </div>
  );
}
