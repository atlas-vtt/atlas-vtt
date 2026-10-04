import { Notice, type Plugin } from 'obsidian';
import { CalendarService } from '../calendar/CalendarService';
import { LogEventModal } from '../events/LogEventModal';
import { WorldNoteIndex } from '../notes/WorldNoteIndex';
import { TimelineView, TIMELINE_VIEW_TYPE } from '../timeline/TimelineView';
import { SceneWorldTimeModal } from '../ui/SceneWorldTimeModal';
import { ActiveAtlasView } from './activeAtlasView';

async function openTimeline(plugin: Plugin): Promise<void> {
  const { workspace } = plugin.app;
  const existing = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
  const leaf = existing ?? workspace.getRightLeaf(false);
  if (!leaf) return;
  if (!existing) await leaf.setViewState({ type: TIMELINE_VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}

/**
 * Registers the world-time parts that live outside a
 * map view: the timeline pane, its commands, and the release of the shared
 * calendar and note index when the plugin unloads.
 */
export function registerWorld(plugin: Plugin): void {
  const scenes = new ActiveAtlasView(plugin);
  plugin.registerView(TIMELINE_VIEW_TYPE, (leaf) => new TimelineView(leaf, scenes));
  plugin.addRibbonIcon('calendar-range', 'Open world timeline', () => { void openTimeline(plugin); });

  plugin.addCommand({ id: 'open-world-timeline', name: 'Open world timeline', callback: () => { void openTimeline(plugin); } });
  plugin.addCommand({
    id: 'log-world-event',
    name: 'Log world event at the scene date',
    callback: () => {
      const view = scenes.get();
      if (!view) {
        new Notice('Open a scene first.');
        return;
      }
      new LogEventModal(plugin.app, view).open();
    },
  });
  plugin.addCommand({
    id: 'scene-world-time',
    name: 'Edit date range and map variants of the scene',
    checkCallback: (checking) => {
      const view = scenes.get();
      if (!view) return false;
      if (!checking) new SceneWorldTimeModal(plugin.app, view.getStore()).open();
      return true;
    },
  });
  plugin.addCommand({
    id: 'clear-scene-viewing-date',
    name: 'Show all times in the scene',
    checkCallback: (checking) => {
      const view = scenes.get();
      if (!view) return false;
      if (!checking) view.getStore().getState().setViewingDate(null);
      return true;
    },
  });

  plugin.register(() => {
    WorldNoteIndex.release(plugin.app);
    CalendarService.release(plugin.app);
  });
}
