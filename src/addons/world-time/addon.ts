import type { AtlasAddon } from 'src/app/addons/AtlasAddon';
import type { ViewAtlasState } from 'src/app/storeFactory';
import { WorldTimeController } from './WorldTimeController';
import { WorldEventRenderer } from './events/WorldEventRenderer';
import { registerWorld } from './plugin/registerWorld';
import { worldSettingsSection } from './plugin/worldSettingsSection';
import { DateBarAboveToolbar, DateBarOnEdge } from './react/DateBarDock';
import { dateBarMenuEntries } from './plugin/dateBarMenu';
import { readSceneWorldTime } from './sceneWorldTime';
import { createInitialWorldTimeState, createWorldTimeActions } from './store/worldTimeSlice';
import { worldDatesMenuEntries } from './ui/worldDatesMenu';
import './worldDated';
import './world.scss';

/**
 * World time: a calendar, a viewing date per scene that hides or ghosts map
 * objects outside their dates, map variants by date, world events at their
 * places and a timeline pane. Remove this folder to remove the feature.
 */
const worldTimeAddon: AtlasAddon = {
  id: 'world-time',
  order: 10,

  onload: (plugin) => registerWorld(plugin),
  settingsSections: (app, settings) => [worldSettingsSection(app, settings)],

  store: {
    initialState: createInitialWorldTimeState,
    actions: (set) => createWorldTimeActions(set),
    // Left out while empty, so undated scenes keep their files unchanged
    persist: (state: ViewAtlasState) => (Object.keys(state.worldTime).length > 0 ? { worldTime: state.worldTime } : {}),
    restore: (saved) => ({ worldTime: readSceneWorldTime(saved.worldTime) }),
  },

  objectMenuEntries: (store, kind, id) => worldDatesMenuEntries(store, kind, id),
  ToolbarAbove: DateBarAboveToolbar,
  MapOverlay: DateBarOnEdge,
  viewActionEntries: dateBarMenuEntries,
  backgroundOverride: (state: ViewAtlasState) => state.worldBackground,

  createRenderer: ({ app, viewport, store, isPlayerView }) => {
    const controller = new WorldTimeController(app, store);
    const events = isPlayerView ? null : new WorldEventRenderer(app, viewport, store);
    return {
      // Event markers are GM notes
      playerViewLayers: () => (events ? [{ layer: events.getContainer(), visible: false }] : []),
      destroy: () => {
        controller.destroy();
        events?.destroy();
      },
    };
  },
};

export default worldTimeAddon;
