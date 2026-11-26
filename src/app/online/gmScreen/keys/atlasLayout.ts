import type { App } from 'obsidian';
import { remoteTableOf } from '../../../plugin/soundRemoteTable';
import { SettingsService } from '../../../services/SettingsService';
import { MoodStore } from '../../../soundLibrary/MoodStore';
import { HoveredElement } from '../../../soundRemote/hoveredElement';
import { savedRollsOnMap } from '../../../soundRemote/remoteTable';
import { rollableFormula } from '../../../tools/rollableFormula';
import type { GmScreenSession } from '../GmScreenSession.ts';
import { LayoutScreen } from './LayoutScreen.ts';
import { settingsLayouts } from './settingsLayouts.ts';

/**
 * Plugs the Keys screen's grid into the session, kept in Atlas's settings. A key may name the library's
 * moods and the saved rolls of the map in front, which the Keys screen's state lists too. Without the
 * settings nothing is plugged, and devices show the long list. Returns what unplugs it.
 */
export function plugLayoutScreen(app: App, session: GmScreenSession): () => void {
  const settings = SettingsService.forApp(app);
  if (settings === undefined) return () => undefined;
  const table = remoteTableOf(app, new HoveredElement(app.workspace));
  return session.plug(new LayoutScreen({
    store: settingsLayouts(settings),
    library: () => ({
      moodName: (id) => MoodStore.forApp(app).mood(id)?.name ?? null,
      rollName: (id) => savedRollsOnMap(table).find((roll) => roll.id === id)?.name ?? null,
      rollable: rollableFormula,
    }),
    outlet: session,
  }));
}
