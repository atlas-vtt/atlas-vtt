import type { SettingsService } from '../app/services/SettingsService';
import { PLAYER_VIEW_RULE_KEYS } from '../shared/playerViewRules';
import type { ApiEvents } from './events';
import { frozenCopy } from './frozen';
import type { AtlasSettingKey, AtlasSettingsView, SettingsApi } from './types/settings';

const KEYS: readonly AtlasSettingKey[] = ['laserPointer', 'diceLook', 'diceDisplay', 'playerView'];

export function settingsView(service: SettingsService): AtlasSettingsView {
  const laser = service.getLaserPointerSettings();
  const look = service.getDiceLook();
  const player = service.getLocalPlayerViewSettings();
  return {
    laserPointer: { color: laser.color, size: laser.size },
    diceLook: { colour: look.colour, font: look.font },
    diceDisplay: service.getDiceDisplay(),
    playerView: Object.fromEntries(PLAYER_VIEW_RULE_KEYS.map((key) => [key, player[key] === true])) as AtlasSettingsView['playerView'],
  };
}

export function settingsApi(service: SettingsService): SettingsApi {
  return Object.freeze({
    get: <K extends AtlasSettingKey>(key: K): AtlasSettingsView[K] => {
      if (!KEYS.includes(key)) throw new Error(`[Atlas API] settings.get: unknown setting "${String(key)}".`);
      return frozenCopy(settingsView(service)[key]);
    },
  });
}

/** `settings-changed` per key whose value changed; returns the stop. */
export function watchSettings(service: SettingsService, events: ApiEvents): () => void {
  let previous = settingsView(service);
  return service.onChange(() => {
    // Runs inside Atlas's own notify loop: a failure here must not stop Atlas's other listeners.
    try {
      const next = settingsView(service);
      const changed = KEYS.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
      previous = next;
      for (const key of changed) events.emit('settings-changed', key);
    } catch (error) {
      console.error('[Atlas API] Could not report a settings change:', error);
    }
  });
}
