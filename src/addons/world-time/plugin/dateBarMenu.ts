import type { App } from 'obsidian';
import type { ContextMenuEntry } from 'src/app/react/components/context-menu/AtlasContextMenu';
import { SettingsService } from 'src/app/services/SettingsService';
import { DATE_BAR_POSITIONS, updateWorldSettings, worldSettingsOf } from '../worldSettings';

/** The date bar's switch and position in the map's More options menu. */
export function dateBarMenuEntries(app: App): ContextMenuEntry[] {
  const service = SettingsService.forApp(app);
  if (!service) return [];
  const { showDateBar, dateBarPosition } = worldSettingsOf(service);
  return [
    {
      type: 'item',
      label: 'Show date bar',
      icon: 'calendar-range',
      checked: showDateBar,
      onClick: () => updateWorldSettings(service, { showDateBar: !showDateBar }),
    },
    {
      type: 'submenu',
      label: 'Date bar position',
      icon: 'move',
      children: DATE_BAR_POSITIONS.map(({ position, label }) => ({
        type: 'item' as const,
        label,
        checked: dateBarPosition === position,
        onClick: () => updateWorldSettings(service, { dateBarPosition: position, showDateBar: true }),
      })),
    },
  ];
}
