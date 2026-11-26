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
 * Deck's switch and its life do not touch it. The handout key shows the image under this computer's
 * pointer, which is followed while a device is connected, by a follower of their own: the Stream Deck
 * stopping its follower leaves this one listening, and the other way round. Returns what unplugs them.
 */
export function plugKeysScreen(app: App, session: GmScreenSession, timers: Timers): () => void {
  return session.plug(new KeysScreen({
    open: () => {
      const moods = MoodStore.forApp(app);
      // Only while a device can press the handout key: nothing watches the pointer otherwise
      const hovered = new HoveredElement(app.workspace);
      hovered.start();
      const control = new RemoteControl({ director: SoundDirector.forApp(app), moods, table: remoteTableOf(app, hovered) });
      const close = (): void => {
        control.dispose();
        hovered.dispose();
      };
      return { control, moods: () => moods.moods(), online: tableOnline, close };
    },
    outlet: session,
    timers,
  }));
}
