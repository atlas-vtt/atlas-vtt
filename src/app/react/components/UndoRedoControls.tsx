import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useMapHotkeys, useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { ToolButton } from '../../packages/components/primitives/ToolButton';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { UndoBarSlot } from '../../packages/components/toolbar/UndoBarSlot';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { t } from '../../i18n';

interface UndoRedoControlsProps {
  viewId?: string;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({ viewId }): React.ReactElement => {
  const { canUndo, canRedo, undo, redo } = useUndoRedo();
  // These hotkeys work while the toolbar editor has the bar hidden.
  useMapHotkeys({ undo, redo, redoAlt: redo }, viewId);
  const hotkeyLabel = useHotkeyLabels();

  return (
    <TooltipProvider delayDuration={300}>
      <UndoBarSlot>
        <ToolButton icon={Undo2} label={t('history.undo')} shortcut={hotkeyLabel('undo')} isActive={false} disabled={!canUndo} onClick={undo} />
        <ToolButton icon={Redo2} label={t('history.redo')} shortcut={hotkeyLabel('redo')} isActive={false} disabled={!canRedo} onClick={redo} />
      </UndoBarSlot>
    </TooltipProvider>
  );
};
