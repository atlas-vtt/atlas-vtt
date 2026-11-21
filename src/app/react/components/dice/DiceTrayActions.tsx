import React from 'react';
import { Bookmark, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TRAY_SURFACE, TRAY_TOOLTIP_GAP } from './diceTrayPool';
import { t } from '../../../i18n';

/** A quiet icon at the tray's foot, with its name and key in a tooltip outside the tray's left edge. */
function FootIcon({ label, shortcut, pressed, onClick, children }: {
  label: string; shortcut?: string; pressed?: boolean; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
  return (
    <LabelTooltip label={label} {...(shortcut && { shortcut })} outside={TRAY_SURFACE} side="left" sideOffset={TRAY_TOOLTIP_GAP}>
      <Button variant="ghost" className="atlas-dice-tray__foot-icon" aria-label={label} aria-pressed={pressed}
        {...(shortcut && { 'aria-keyshortcuts': shortcut.toUpperCase() })} onClick={onClick}>
        {children}
      </Button>
    </LabelTooltip>
  );
}

interface DiceTrayActionsProps {
  /** Roll's words, and whether it can roll. */
  rollLabel: string;
  canRoll: boolean;
  onRoll: () => void;
  canClear: boolean;
  onClear: () => void;
  /** The saved rolls' panel: whether it stands open, and its switch. */
  presetsPanel?: { open: boolean; onToggle: () => void } | undefined;
  /** The dice row's edit mode; left out where the row cannot be changed (a scene in no collection). */
  rowEdit?: { editing: boolean; onToggle: () => void; onStandard: (() => void) | null } | undefined;
}

/**
 * The tray's foot, from the left: the saved rolls, the dice row's edit mode, Clear and Roll (its key on its face).
 * While the row is edited, Done in Roll's place, and the arrow back to the standard dice where the row is the
 * collection's own.
 */
export function DiceTrayActions({ rollLabel, canRoll, onRoll, canClear, onClear, presetsPanel, rowEdit }: DiceTrayActionsProps): React.ReactElement {
  if (rowEdit?.editing) {
    return (
      <div className="atlas-dice-tray__actions">
        {rowEdit.onStandard && (
          <FootIcon label={t('diceRoll.rowStandard')} onClick={rowEdit.onStandard}><RotateCcw aria-hidden="true" /></FootIcon>
        )}
        <Button className="atlas-dice-tray__roll" onClick={rowEdit.onToggle} aria-keyshortcuts="Escape">{t('diceRoll.rowDone')}</Button>
      </div>
    );
  }
  return (
    // Roll carries its key on its face (↵): a tooltip over it covered the rows above.
    <div className="atlas-dice-tray__actions">
      {presetsPanel && (
        <FootIcon label={t('diceRoll.presetsTitle')} shortcut="P" pressed={presetsPanel.open} onClick={presetsPanel.onToggle}>
          <Bookmark aria-hidden="true" />
        </FootIcon>
      )}
      {rowEdit && (
        <FootIcon label={t('diceRoll.rowEdit')} shortcut="E" onClick={rowEdit.onToggle}><Pencil aria-hidden="true" /></FootIcon>
      )}
      <Button variant="ghost" className="atlas-dice-tray__clear" onClick={onClear} disabled={!canClear}>
        {t('diceRoll.clear')}
      </Button>
      <Button className="atlas-dice-tray__roll" onClick={onRoll} disabled={!canRoll} aria-keyshortcuts="Enter">
        <span className="atlas-dice-tray__roll-label">{rollLabel}</span>
        <kbd className="atlas-dice-tray__roll-key" aria-hidden="true">↵</kbd>
      </Button>
    </div>
  );
}
