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
 * pointer, which is followed for as long as Sidekick runs, whatever its devices do: a phone that locks
 * leaves and joins again, and the pointer it finds must be the one that came to rest meanwhile. The
 * follower is Sidekick's own, so the Stream Deck stopping its follower leaves this one listening, and the
 * other way round. Returns what unplugs them and stops the follower.
 */
export function plugKeysScreen(app: App, session: GmScreenSession, timers: Timers): () => void {
  const hovered = new HoveredElement(app.workspace);
  const follow = (): void => (session.view().status === 'stopped' ? hovered.dispose() : hovered.start());
  follow();
  const stopFollowing = session.onChange(follow);
  const unplug = session.plug(new KeysScreen({
    open: () => {
      const moods = MoodStore.forApp(app);
      const control = new RemoteControl({ director: SoundDirector.forApp(app), moods, table: remoteTableOf(app, hovered) });
      return { control, moods: () => moods.moods(), online: tableOnline, close: () => control.dispose() };
    },
    outlet: session,
    timers,
  }));
  return () => {
    unplug();
    stopFollowing();
    hovered.dispose();
  };
}
