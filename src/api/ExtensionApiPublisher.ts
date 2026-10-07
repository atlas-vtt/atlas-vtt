import type AtlasVTTPlugin from '../../main';
import { syncPresentingCommands } from '../app/plugin/presentingCommands';
import { AssetService } from '../app/services/AssetService';
import { AtlasApiHost } from './AtlasApiHost';
import { ATLAS_VIEW_HOOKS } from './atlasViewHooks';
import { LANDED_CAPABILITIES } from './capabilities';
import { buildExtension } from './extension';
import { watchRules } from './rules';
import { watchSettings } from './settings';
import type { ApiServices } from './services';
import { ViewTracker } from './viewTracker';

/** Publishes `plugin.api` once storage and the asset index have settled (loaded or failed), and takes it down on unload. */
export class ExtensionApiPublisher {
  private host: AtlasApiHost | null = null;
  private views: ViewTracker | null = null;
  private stopWatches: Array<() => void> = [];
  private stopped = false;

  constructor(private readonly plugin: AtlasVTTPlugin) {}

  async start(): Promise<void> {
    try {
      await AssetService.getInstance(this.plugin.app).initialize();
    } catch (error) {
      // Publish anyway: a failed index must not disable every extension.
      console.error('[Atlas API] The asset index failed to load; publishing the API without it:', error);
    }
    if (this.stopped) return;
    // The tracker needs the host's events and the host's builder needs the tracker: services is read lazily.
    let services!: ApiServices;
    const host = new AtlasApiHost({
      app: this.plugin.app,
      capabilities: LANDED_CAPABILITIES,
      build: (scope) => buildExtension(scope, services),
      onFirstConnect: () => this.watch(host, views),
    });
    const views = new ViewTracker(this.plugin.app, host.apiEvents, ATLAS_VIEW_HOOKS);
    services = { app: this.plugin.app, plugin: this.plugin, views, settings: this.plugin.settingsService };
    this.host = host;
    this.views = views;
    this.plugin.api = host.api;
    host.publish();
  }

  /**
   * The view tracker and the watches behind the API's events, started as the first extension connects: until then
   * stock Atlas carries no listener for extensions.
   */
  private watch(host: AtlasApiHost, views: ViewTracker): void {
    if (this.stopped) return;
    views.start();
    this.stopWatches.push(watchRules(this.plugin.app, host.apiEvents, true), watchSettings(this.plugin.settingsService, host.apiEvents));
    // Present to players and Stop presenting come with the first presentation target an extension registers.
    this.stopWatches.push(syncPresentingCommands(this.plugin));
  }

  stop(): void {
    this.stopped = true;
    for (const stopWatch of this.stopWatches.splice(0)) stopWatch();
    this.host?.dispose();
    this.host = null;
    this.views?.stop();
    this.views = null;
    this.plugin.api = undefined;
  }
}
