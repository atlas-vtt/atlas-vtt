import type { App } from 'obsidian';
import type { Timers } from '../../gm/companionTimers.ts';
import type { GmScreenSession } from '../GmScreenSession.ts';
import { LookScreen } from './LookScreen.ts';
import { readLook } from './readLook.ts';

/**
 * Plugs the GM's look into Sidekick: read off the main window, whose body carries the scheme, Atlas's look and
 * the picked accent as every popout's does, and read again whenever Obsidian announces a change of theme, scheme or
 * accent, or Atlas one of its look (`css-change`). Returns what unplugs it.
 */
export function plugLookScreen(app: App, session: GmScreenSession, timers: Timers): () => void {
  const screen = new LookScreen({ read: () => readLook(app.workspace.containerEl.doc), outlet: session, timers });
  const unplug = session.plug(screen);
  const changed = app.workspace.on('css-change', () => screen.changed());
  return () => {
    app.workspace.offref(changed);
    unplug();
    screen.dispose();
  };
}
