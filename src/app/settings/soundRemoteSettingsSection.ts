import type { ButtonComponent } from 'obsidian';
import { getLocale, t } from '../i18n';
import { REMOTE_PORT } from '../soundRemote/remoteProtocol';
import type { RemoteSettingsStore } from '../soundRemote/remoteSettings';
import { showNotice } from '../ui/notice';
import { ATLAS_STREAM_DECK_URL } from '../support/communityLinks';
import type { AtlasSettingSection } from './settingSections';

function pairedText(remote: RemoteSettingsStore): string {
  const { client, pairedAt } = remote.get();
  if (!client || pairedAt === null) return t('remote.notPaired');
  return t('remote.pairedWith', { client, date: new Date(pairedAt).toLocaleDateString(getLocale()) });
}

/** The Stream Deck: this device's switch, and the controller it trusts. Desktop only. */
export function soundRemoteSettingsSection(remote: RemoteSettingsStore): AtlasSettingSection {
  return {
    heading: t('remote.heading'),
    rows: [
      {
        name: t('remote.plugin'),
        desc: t('remote.pluginHint'),
        aliases: ['stream deck', 'streamdeck', 'elgato', 'opendeck', 'plugin', 'download', 'install'],
        render: (setting) => {
          setting.addButton((button) => button.setButtonText(t('remote.pluginGet')).onClick(() => { window.open(ATLAS_STREAM_DECK_URL); }));
        },
      },
      {
        name: t('remote.enable'),
        desc: t('remote.enableHint', { port: REMOTE_PORT }),
        aliases: ['stream deck', 'streamdeck', 'elgato', 'opendeck', 'remote', 'controller', 'sound', 'music'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle.setValue(remote.get().enabled).onChange((enabled) => remote.setEnabled(enabled)));
        },
      },
      {
        name: t('remote.paired'),
        desc: pairedText(remote),
        aliases: ['stream deck', 'pair', 'revoke', 'token'],
        render: (setting) => {
          setting.setDesc(pairedText(remote));
          let revoke: ButtonComponent | null = null;
          setting.addButton((button) => {
            revoke = button;
            button.setButtonText(t('remote.revoke')).setDisabled(!remote.get().tokenHash).onClick(() => {
              remote.revoke();
              showNotice(t('remote.revoked'));
            });
          });
          // Obsidian's declarative settings may not call the cleanup, so a row that left the page lets go itself.
          const stop = remote.onChange(() => {
            if (!setting.settingEl.isConnected) {
              stop();
              return;
            }
            setting.setDesc(pairedText(remote));
            revoke?.setDisabled(!remote.get().tokenHash);
          });
          return stop;
        },
      },
    ],
  };
}
