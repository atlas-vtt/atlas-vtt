import type { Plugin } from 'obsidian';
import { t } from '../i18n';
import { MoodStore } from '../soundLibrary/MoodStore';
import type { SoundDirector } from '../soundDirector/SoundDirector';
import { nodeHttpOf } from '../soundRemote/nodeHttp';
import { REMOTE_PORT } from '../soundRemote/remoteProtocol';
import { HoveredElement } from '../soundRemote/hoveredElement';
import { RemoteSettingsStore } from '../soundRemote/remoteSettings';
import { SoundRemoteServer, type PairingPrompt } from '../soundRemote/SoundRemoteServer';
import { showNotice } from '../ui/notice';
import { ChoiceModal } from './ChoiceModal';
import { remoteTableOf } from './soundRemoteTable';

function askToPair(plugin: Plugin, client: string): PairingPrompt {
  const modal = new ChoiceModal<boolean>(plugin.app, {
    title: t('remote.pairTitle', { client }),
    message: [t('remote.pairMessage')],
    hint: t('remote.pairHint'),
    buttons: [{ text: t('remote.allow'), value: true, variant: 'cta' }],
  });
  return { answer: modal.prompt().then((choice) => choice === true), cancel: () => modal.close() };
}

/**
 * The sound remote (Stream Deck): listens on 127.0.0.1 while this device's switch is on, in the desktop app
 * only. The director outlives it, so `onunload` stops it first, and the levels a dial moved are written then.
 */
export function registerSoundRemote(plugin: Plugin, director: SoundDirector): RemoteSettingsStore {
  const settings = new RemoteSettingsStore(plugin.app);
  let server: SoundRemoteServer | null = null;
  const hovered = new HoveredElement(plugin.app.workspace);
  const stop = (): void => {
    server?.stop();
    server = null;
    hovered.dispose();
  };
  const follow = (): void => {
    const wanted = settings.get().enabled;
    if (wanted && !server) {
      const http = nodeHttpOf(window);
      if (!http) return;
      // Only while the remote listens: nothing watches the pointer otherwise
      hovered.start();
      server = new SoundRemoteServer({
        http,
        port: REMOTE_PORT,
        director,
        moods: MoodStore.forApp(plugin.app),
        table: remoteTableOf(plugin.app, hovered),
        settings,
        askToPair: (client) => askToPair(plugin, client),
        onListenError: (error) => {
          console.error('[Atlas] The sound remote could not listen', error);
          showNotice(t('remote.portTaken', { port: REMOTE_PORT }));
          stop();
        },
      });
      server.start();
    } else if (!wanted && server) {
      stop();
    }
  };
  plugin.app.workspace.onLayoutReady(follow);
  plugin.register(settings.onChange(follow));
  plugin.register(stop);
  return settings;
}
