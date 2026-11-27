import type { App } from 'obsidian';
import { remoteTableOf } from '../../../plugin/soundRemoteTable';
import { SettingsService } from '../../../services/SettingsService';
import { MoodStore } from '../../../soundLibrary/MoodStore';
import { HoveredElement } from '../../../soundRemote/hoveredElement';
import { diceKeyRolls, savedRollsOnMap } from '../../../soundRemote/remoteTable';
import type { Timers } from '../../gm/companionTimers.ts';
import type { GmScreenSession } from '../GmScreenSession.ts';
import { LayoutScreen } from './LayoutScreen.ts';
import { settingsLayouts } from './settingsLayouts.ts';

/**
 * Plugs the Keys screen's grid into the session, kept in Atlas's settings. A key may name the library's
 * moods and the saved rolls of the map in front, which the Keys screen's state lists too. Without the
 * settings nothing is plugged, and devices show the long list. Returns what unplugs it.
 */
export function plugLayoutScreen(app: App, session: GmScreenSession, timers: Timers): () => void {
  const settings = SettingsService.forApp(app);
  if (settings === undefined) return () => undefined;
  const table = remoteTableOf(app, new HoveredElement(app.workspace));
  const store = settingsLayouts(settings, timers);
  const screen = new LayoutScreen({
    store,
    library: () => ({
      moodName: (id) => MoodStore.forApp(app).mood(id)?.name ?? null,
      rollName: (id) => savedRollsOnMap(table).find((roll) => roll.id === id)?.name ?? null,
      rollable: (formula) => diceKeyRolls(table, formula),
    }),
    outlet: session,
    timers,
  });
  const unplug = session.plug(screen);
  return () => {
    unplug();
    screen.dispose();
    // Atlas unloads, or online play was switched off: the grids that wait are written now, whatever unloads next.
    if (store.flush()) void settings.saveSettingsNow();
  };
}
