import type { App } from 'obsidian';
import { remoteTableOf } from '../../../plugin/soundRemoteTable';
import { MoodStore } from '../../../soundLibrary/MoodStore';
import { SoundDirector } from '../../../soundDirector/SoundDirector';
import { HoveredElement } from '../../../soundRemote/hoveredElement';
import { RemoteControl } from '../../../soundRemote/remoteControl';
import type { Timers } from '../../gm/companionTimers.ts';
import type { GmScreenSession } from '../GmScreenSession.ts';
import { KeysScreen } from './KeysScreen.ts';
import { tableOnline } from './tableOnline.ts';

/**
 * Plugs the Keys and Sound screens into the session, on a sound remote control of their own: the Stream
 * Deck's switch and its life do not touch it. A device never presses the image under this computer's
 * pointer, so the pointer is never followed for it. Returns what unplugs them.
 */
export function plugKeysScreen(app: App, session: GmScreenSession, timers: Timers): () => void {
  return session.plug(new KeysScreen({
    open: () => {
      const moods = MoodStore.forApp(app);
      const control = new RemoteControl({ director: SoundDirector.forApp(app), moods, table: remoteTableOf(app, new HoveredElement(app.workspace)) });
      return { control, moods: () => moods.moods(), online: tableOnline };
    },
    outlet: session,
    timers,
  }));
}
