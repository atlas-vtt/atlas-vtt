import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { slottedResources } from '../../../resources/resourceSlots';
import { useMapResources } from '../../../resources/useMapResources';
import { mapRules, updateMapRules } from '../../../services/mapRules';
import type { AtlasSettings, SettingsService } from '../../../services/SettingsService';
import { DEFAULT_SETTINGS } from '../../../services/atlasSettings';
import { runInBackground } from '../../../utils/backgroundTask';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { resourceToggleLabel } from './resourceToggleLabel';
import { t } from '../../../i18n';
import { DEFAULT_INITIATIVE_LAYOUT, playersListLayout, playersListMirrored, playersListShape } from '../../../initiative/initiativeLayout';
import { DEFAULT_TURN_OPTIONS } from '../../../initiative/turnOptions';

type LocalPlayerViewSettings = AtlasSettings['localPlayerView'];
/** The settings that are switches; the sizes and durations are sliders of the palette's panel. */
type PlayerViewSwitchKey = {
  [Key in keyof LocalPlayerViewSettings]: LocalPlayerViewSettings[Key] extends boolean ? Key : never;
}[Exclude<keyof LocalPlayerViewSettings, 'showToolbar' | 'showCommandPalette' | 'showNotePreviews'>];

interface SwitchText {
  key: PlayerViewSwitchKey;
  label: string;
  /** What the switch does, in a sentence: shown where a row has room for it. */
  hint?: string;
}

const UI_SWITCHES: ReadonlyArray<SwitchText> = [
  { key: 'showWidgets', label: t('lpv.showWidgets') },
  { key: 'showInitiative', label: t('lpv.showInitiative') },
  { key: 'showDiceRolls', label: t('lpv.showDiceRolls') },
];

/** What only an online table has: shown while online play is switched on. */
const ONLINE_SWITCHES: ReadonlyArray<SwitchText> = [
  { key: 'showCursors', label: t('lpv.showCursors') },
  { key: 'playersDraw', label: t('lpv.playersDraw'), hint: t('lpv.playersDrawHint') },
];

/** How the initiative list looks to the players. */
const INITIATIVE_SWITCHES: ReadonlyArray<SwitchText> = [
  { key: 'initiativePulse', label: t('lpv.initiativePulse'), hint: t('lpv.initiativePulseHint') },
  { key: 'turnBannerAtLists', label: t('lpv.turnBannerAtLists'), hint: t('lpv.turnBannerAtListsHint') },
  { key: 'turnDim', label: t('lpv.turnDim'), hint: t('lpv.turnDimHint') },
];

const TOKEN_SWITCHES: ReadonlyArray<SwitchText> = [
  { key: 'showTokenNameplates', label: t('tokens.showNameplates') },
];

/** One switch of what players see. */
export interface PlayerViewSwitch {
  id: string;
  label: string;
  /** What the switch does, in a sentence; none for one whose name says it. */
  hint?: string;
  value: boolean;
  onToggle: () => void;
}

/** What players see, as switches: the palette's player view settings and the player window bar's menu show the same ones. */
export interface PlayerViewSwitches {
  /** The widgets, initiative (whether its list runs as a row, and is mirrored for the far side of the table) and dice rolls: the player window and online players alike. */
  shared: PlayerViewSwitch[];
  /** The players' cursors, whether players may draw and whether they move only on their turn: online play only, none while it is switched off. */
  online: PlayerViewSwitch[];
  /** The initiative list's pulse and turn banner in the player window. */
  initiative: PlayerViewSwitch[];
  /** Rendering up to 4K, on this device: the player window only. */
  view4k: PlayerViewSwitch;
  /**
   * One per resource of the rules the open scene plays by, bars and wheels alike; none for a map
   * that plays by no rules. The player window shows the wheels they see at rest, as it cannot hover or select.
   */
  resources: PlayerViewSwitch[];
  /** The tokens' nameplates, for the player window and online players alike. */
  tokens: PlayerViewSwitch[];
}

/** The switches of what players see, following the settings and the open scene's rules. `explicit` is the view's settings, where known. */
export function usePlayerViewSwitches(explicit?: SettingsService): PlayerViewSwitches {
  const { app } = useAtlasUI();
  const settings = useAtlasSettings(explicit);
  const resources = useMapResources();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const values = settings?.getLocalPlayerViewSettings() ?? DEFAULT_SETTINGS.localPlayerView;
  const view4k = settings?.isPlayerView4k() ?? false;
  const onlinePlay = settings?.isExperimentalOn('onlinePlay') ?? false;

  const switchOf = ({ key, label, hint }: SwitchText): PlayerViewSwitch => ({
    id: key,
    label,
    ...(hint !== undefined && { hint }),
    value: values[key] === true,
    onToggle: () => settings?.setLocalPlayerViewSettings({ [key]: values[key] !== true }),
  });

  const { source } = mapRules(app, mapPath);
  const toggleResource = (key: string): void => {
    if (source.kind === 'none') return;
    const next = resources.map((resource) => (
      resource.key === key ? { ...resource, visibleToPlayers: !resource.visibleToPlayers } : resource
    ));
    runInBackground(updateMapRules(app, source, { resources: next }), 'Saving what players see');
  };

  // The players' list as a row across the screen, and mirrored for the far side of the table: two choices, each kept as
  // the other changes
  const layout = settings?.initiativeLayout() ?? DEFAULT_INITIATIVE_LAYOUT;
  const rows = playersListShape(layout) === 'horizontal';
  const mirrored = playersListMirrored(layout);
  const initiativeRows: PlayerViewSwitch = {
    id: 'initiativeRows',
    label: t('lpv.initiativeRows'),
    hint: t('lpv.initiativeRowsHint'),
    value: rows,
    onToggle: () => settings?.setInitiativeLayout(playersListLayout(rows ? 'vertical' : 'horizontal', mirrored)),
  };
  const initiativeMirrored: PlayerViewSwitch = {
    id: 'initiativeMirrored',
    label: t('lpv.initiativeMirrored'),
    hint: t('lpv.initiativeMirroredHint'),
    value: mirrored,
    onToggle: () => settings?.setInitiativeLayout(playersListLayout(rows ? 'horizontal' : 'vertical', !mirrored)),
  };
  // A GM's choice for the table rather than a player view setting, but the player view's online settings are where it is looked for
  const movesOnTurn = (settings?.initiativeTurnOptions() ?? DEFAULT_TURN_OPTIONS).movesOnTurn;
  const movesOnTurnSwitch: PlayerViewSwitch = {
    id: 'movesOnTurn',
    label: t('initiative.movesOnTurn'),
    hint: t('initiative.movesOnTurnHint'),
    value: movesOnTurn,
    onToggle: () => settings?.setInitiativeTurnOptions({ movesOnTurn: !movesOnTurn }),
  };

  return {
    shared: UI_SWITCHES.flatMap((text) => (text.key === 'showInitiative' ? [switchOf(text), initiativeRows, initiativeMirrored] : [switchOf(text)])),
    online: onlinePlay ? [...ONLINE_SWITCHES.map(switchOf), movesOnTurnSwitch] : [],
    initiative: INITIATIVE_SWITCHES.map(switchOf),
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
