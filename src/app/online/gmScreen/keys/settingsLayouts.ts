import type { GmScreenDevice, GmScreenLayout } from '../../protocol/index.ts';
import type { SettingsService } from '../../../services/SettingsService';
import type { GmScreenKeys } from '../../../services/gmScreenKeysSettings';
import type { Timers } from '../../gm/companionTimers.ts';
import { defaultLayout } from './defaultLayouts.ts';
import type { LayoutStore } from './LayoutScreen.ts';

/**
 * A change to the grids waits this long for the next before they are written to the settings, whose file
 * follows the GM to other computers: arranging keys writes it on a pause, not on every change.
 */
export const LAYOUT_SAVE_QUIET_MS = 5000;
/** The longest a change waits to be written while changes keep coming: what a crash may lose, with the settings' own wait. */
export const LAYOUT_SAVE_MAX_MS = 10_000;

const isDefault = (device: GmScreenDevice, layout: GmScreenLayout): boolean => JSON.stringify(layout) === JSON.stringify(defaultLayout(device));

/** `keys` with `layout` as the grid of `device`: none where it is the default, as the toolbar's layout is stored. */
function withLayout(keys: GmScreenKeys, device: GmScreenDevice, layout: GmScreenLayout): GmScreenKeys {
  const { [device]: _before, ...others } = keys;
  return isDefault(device, layout) ? others : { ...others, [device]: layout };
}

/**
 * The grids as the GM's preference in Atlas's settings. A changed grid holds here at once and reaches the
 * settings on a pause (`LAYOUT_SAVE_QUIET_MS`), at the latest after `LAYOUT_SAVE_MAX_MS`, or when `flush` is
 * called: when no device is left and when Atlas unloads.
 */
export function settingsLayouts(settings: Pick<SettingsService, 'get' | 'set' | 'onChange'>, timers: Timers): LayoutStore {
  const waiting = new Map<GmScreenDevice, GmScreenLayout>();
  let timer: number | null = null;
  let firstAt = 0;
  const flush = (): boolean => {
    if (timer !== null) timers.clearTimer(timer);
    timer = null;
    if (waiting.size === 0) return false;
    const keys = [...waiting].reduce((each, [device, layout]) => withLayout(each, device, layout), settings.get('gmScreenKeys'));
    waiting.clear();
    settings.set('gmScreenKeys', keys);
    return true;
  };
  return {
    layout: (device) => waiting.get(device) ?? settings.get('gmScreenKeys')[device] ?? defaultLayout(device),
    save: (device, layout) => {
      waiting.set(device, layout);
      const now = timers.now();
      if (timer === null) firstAt = now;
      else timers.clearTimer(timer);
      timer = timers.setTimer(flush, Math.min(LAYOUT_SAVE_QUIET_MS, firstAt + LAYOUT_SAVE_MAX_MS - now));
    },
    flush,
    onChange: (listener) => settings.onChange(() => listener()),
  };
}
