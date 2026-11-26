import React from 'react';
import { CircleHelp } from 'lucide-react';
import { ToolButton } from '../../packages/components/primitives/ToolButton';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { SideBarSlot } from '../../packages/components/toolbar/SideBarSlot';
import { useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { useAtlasStore } from '../ViewStoreContext';
import { t } from '../../i18n';

/** A bar of its own at the map's bottom right that opens the keyboard shortcuts cheat sheet, which the `help` hotkey opens too; the toolbar editor may hide it. */
export function HotkeyHelpButton(): React.ReactElement {
  const setHotkeyHelpOpen = useAtlasStore(state => state.setHotkeyHelpOpen);
  const hotkeyLabel = useHotkeyLabels();

  return (
    <TooltipProvider delayDuration={300}>
      <SideBarSlot id="help" contentClassName="atlas-vtt-toolbar atlas-hotkey-help-bar">
        <ToolButton icon={CircleHelp} label={t('hotkey.help')} shortcut={hotkeyLabel('help')} isActive={false} onClick={() => setHotkeyHelpOpen(true)} />
      </SideBarSlot>
    </TooltipProvider>
  );
}
