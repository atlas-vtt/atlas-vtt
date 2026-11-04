import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { slottedResources } from '../../../resources/resourceSlots';
import { useMapResources } from '../../../resources/useMapResources';
import { mapRules, updateMapRules } from '../../../services/mapRules';
import type { AtlasSettings, SettingsService } from '../../../services/SettingsService';
import { runInBackground } from '../../../utils/backgroundTask';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { resourceToggleLabel } from './resourceToggleLabel';
import { t } from '../../../i18n';

type LocalPlayerViewSettings = AtlasSettings['localPlayerView'];
type PlayerViewSwitchKey = Exclude<keyof LocalPlayerViewSettings, 'showToolbar' | 'showCommandPalette' | 'showNotePreviews'>;

const DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS: LocalPlayerViewSettings = {
  showToolbar: false,
  showTokenNameplates: false,
  showNotePreviews: false,
  showWidgets: true,
  showInitiative: true,
  showDiceRolls: false,
  showCommandPalette: false,
  showCursors: false,
};

const UI_SWITCHES: ReadonlyArray<{ key: PlayerViewSwitchKey; label: string }> = [
  { key: 'showWidgets', label: t('lpv.showWidgets') },
  { key: 'showInitiative', label: t('lpv.showInitiative') },
  { key: 'showDiceRolls', label: t('lpv.showDiceRolls') },
];

/** What only an online table has: shown while online play is switched on. */
const ONLINE_SWITCHES: ReadonlyArray<{ key: PlayerViewSwitchKey; label: string }> = [
  { key: 'showCursors', label: t('lpv.showCursors') },
];

const TOKEN_SWITCHES: ReadonlyArray<{ key: PlayerViewSwitchKey; label: string }> = [
  { key: 'showTokenNameplates', label: t('tokens.showNameplates') },
];

/** One switch of what players see. */
export interface PlayerViewSwitch {
  id: string;
  label: string;
  value: boolean;
  onToggle: () => void;
}

/** What players see, as switches: the palette's player view settings and the player window bar's menu show the same ones. */
export interface PlayerViewSwitches {
  /** The widgets, initiative and dice rolls, and online the players' cursors. */
  interface: PlayerViewSwitch[];
  /** Rendering up to 4K, on this device. */
  view4k: PlayerViewSwitch;
  /**
   * One per resource of the rules the open scene plays by, bars and wheels alike; none for a map
   * that plays by no rules. The player window shows the wheels they see at rest, as it cannot hover or select.
   */
  resources: PlayerViewSwitch[];
  /** The tokens' nameplates. */
  tokens: PlayerViewSwitch[];
}

/** The switches of what players see, following the settings and the open scene's rules. `explicit` is the view's settings, where known. */
export function usePlayerViewSwitches(explicit?: SettingsService): PlayerViewSwitches {
  const { app } = useAtlasUI();
  const settings = useAtlasSettings(explicit);
  const resources = useMapResources();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const values = settings?.getLocalPlayerViewSettings() ?? DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS;
  const view4k = settings?.isPlayerView4k() ?? false;
  const onlinePlay = settings?.isExperimentalOn('onlinePlay') ?? false;

  const switchOf = ({ key, label }: { key: PlayerViewSwitchKey; label: string }): PlayerViewSwitch => ({
    id: key,
    label,
    value: values[key],
    onToggle: () => settings?.setLocalPlayerViewSettings({ [key]: !values[key] }),
  });

  const { source } = mapRules(app, mapPath);
  const toggleResource = (key: string): void => {
    if (source.kind === 'none') return;
    const next = resources.map((resource) => (
      resource.key === key ? { ...resource, visibleToPlayers: !resource.visibleToPlayers } : resource
    ));
    runInBackground(updateMapRules(app, source, { resources: next }), 'Saving what players see');
  };

  return {
    interface: [...UI_SWITCHES, ...(onlinePlay ? ONLINE_SWITCHES : [])].map(switchOf),
    view4k: { id: 'view4k', label: t('lpv.view4k'), value: view4k, onToggle: () => settings?.setPlayerView4k(!view4k) },
    resources: source.kind === 'none' ? [] : slottedResources(resources).map(({ definition: resource, slot }) => ({
      id: `resource:${resource.key}`,
      label: resourceToggleLabel(resource, slot),
      value: resource.visibleToPlayers,
      onToggle: () => toggleResource(resource.key),
    })),
    tokens: TOKEN_SWITCHES.map(switchOf),
  };
}
