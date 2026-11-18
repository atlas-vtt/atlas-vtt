import type { Plugin } from 'obsidian';
import { ArmariumInstaller } from '../armarium/ArmariumInstaller';
import { ArmariumHosts, type ArmariumHost } from '../armarium/armariumHosts';
import { requestFromParams } from '../armarium/armariumRequest';
import type { GlobalAssetManagerService } from '../services/GlobalAssetManagerService';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';

/** `obsidian://atlas-vtt-install?uid=…&version=…`, the Armarium listing page's "Open in Atlas". */
export const INSTALL_LINK_ACTION = 'atlas-vtt-install';

/** The view type of the Armarium's own tab in earlier builds, which a saved workspace may still hold. */
export const FORMER_ARMARIUM_TAB = 'atlas-armarium';

/**
 * The Armarium, shown in the asset manager: the command that opens it there, its installer (one per app, released on
 * unload) and the install link. The command, the link and an install's review go to the newest open asset manager
 * (`ArmariumHosts`), else to the global one, opened on the Armarium. `assetManager` is read each time: it is made
 * after this runs.
 */
export function registerArmarium(plugin: Plugin, assetManager: () => GlobalAssetManagerService | undefined): void {
  const { app } = plugin;
  const hosts = ArmariumHosts.forApp(app);
  const host = (): ArmariumHost => hosts.current() ?? {
    show: () => assetManager()?.openArmarium(),
    review: (pending) => {
      const manager = assetManager();
      if (!manager) throw new Error('The asset manager is not ready yet.');
      manager.importBundle(pending);
    },
  };
  const installer = ArmariumInstaller.open(app, { review: (pending) => host().review(pending) });
  plugin.register(() => ArmariumInstaller.release(app));

  plugin.addCommand({
    id: 'open-armarium',
    name: t('armarium.command'),
    callback: () => host().show(),
  });

  // Any web page can open this link, so it only starts what the Install button does: the import review is the consent.
  plugin.registerObsidianProtocolHandler(INSTALL_LINK_ACTION, (params) => {
    const request = requestFromParams(params);
    if (!request) {
      showNotice(t('armarium.badLink'));
      return;
    }
    host().show();
    void installer.install(request);
  });

  // The Armarium had a tab of its own before it moved into the asset manager; Obsidian would restore one as an
  // empty "plugin no longer active" pane.
  app.workspace.onLayoutReady(() => app.workspace.detachLeavesOfType(FORMER_ARMARIUM_TAB));
}
