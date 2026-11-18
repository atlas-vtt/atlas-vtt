import type { Plugin } from 'obsidian';
import { ArmariumInstaller } from '../armarium/ArmariumInstaller';
import { ArmariumView } from '../armarium/ArmariumView';
import { requestFromParams } from '../armarium/armariumRequest';
import { ARMARIUM_VIEW_TYPE, showArmarium } from '../armarium/showArmarium';
import type { ExternalImport } from '../services/collectionBundle/externalImport';
import type { GlobalAssetManagerService } from '../services/GlobalAssetManagerService';
import { runInBackground } from '../utils/backgroundTask';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';

/** `obsidian://atlas-vtt-install?uid=…&version=…`, the Armarium listing page's "Open in Atlas". */
export const INSTALL_LINK_ACTION = 'atlas-vtt-install';

/**
 * The Armarium: its tab, the command that opens it, its installer (one per app, released on unload) and the install
 * link. Registered before the views, so a restored Armarium tab finds its installer. `assetManager` is read at each
 * install: the asset manager whose import review the GM confirms an install in.
 */
export function registerArmarium(plugin: Plugin, assetManager: () => GlobalAssetManagerService | undefined): void {
  const { app } = plugin;
  const installer = ArmariumInstaller.open(app, {
    review: (pending: ExternalImport) => {
      const manager = assetManager();
      if (!manager) throw new Error('The asset manager is not ready yet.');
      manager.importBundle(pending);
    },
  });
  plugin.register(() => ArmariumInstaller.release(app));

  plugin.registerView(ARMARIUM_VIEW_TYPE, (leaf) => new ArmariumView(leaf));
  plugin.addCommand({
    id: 'open-armarium',
    name: t('armarium.command'),
    callback: () => runInBackground(showArmarium(app), 'Opening the Armarium'),
  });

  // Any web page can open this link, so it only starts what the Install button does: the import review is the consent.
  plugin.registerObsidianProtocolHandler(INSTALL_LINK_ACTION, (params) => {
    const request = requestFromParams(params);
    if (!request) {
      showNotice(t('armarium.badLink'));
      return;
    }
    void installer.install(request);
  });
}
