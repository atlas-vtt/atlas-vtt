import type { SettingsService } from '../../../services/SettingsService';
import { defaultLayout } from './defaultLayouts.ts';
import type { LayoutStore } from './LayoutScreen.ts';

/**
 * The grids as the GM's preference in Atlas's settings, which follow the GM to another computer: a grid
 * is stored only while it differs from the default, as the toolbar's layout is.
 */
export function settingsLayouts(settings: Pick<SettingsService, 'getGmScreenKeys' | 'setGmScreenKeys' | 'onChange'>): LayoutStore {
  return {
    layout: (device) => settings.getGmScreenKeys()[device] ?? defaultLayout(device),
    save: (device, layout) => {
      const { [device]: _before, ...others } = settings.getGmScreenKeys();
      const isDefault = JSON.stringify(layout) === JSON.stringify(defaultLayout(device));
      settings.setGmScreenKeys(isDefault ? others : { ...others, [device]: layout });
    },
    onChange: (listener) => settings.onChange(() => listener()),
  };
}
