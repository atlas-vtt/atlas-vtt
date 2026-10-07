import type { App } from 'obsidian';
import { DisposerSet } from './disposers';
import { ApiEvents } from './events';
import type { ExtensionScope } from './extension';
import type { AtlasApi, AtlasExtension, ConnectingPlugin } from './types/api';
import type { AtlasCapability } from './types/common';
import { API_VERSION } from './version';

export interface ApiHostOptions {
  app: App;
  capabilities: readonly AtlasCapability[];
  build(scope: ExtensionScope): AtlasExtension;
  /** Runs once, as the first extension connects: what Atlas does only for extensions starts here, never before. */
  onFirstConnect?(): void;
}

/** The published API object and every connected extension's registrations. */
export class AtlasApiHost {
  readonly api: AtlasApi;
  private readonly events = new ApiEvents();
  private readonly connected = new Map<string, { plugin: ConnectingPlugin; disposers: DisposerSet }>();
  /** Obsidian cannot unregister, so each plugin object gets one `register` callback per host. */
  private readonly registered = new WeakSet<object>();
  /** What those callbacks reach the host through; cleared on dispose so an old host is not retained. */
  private readonly link: { host: AtlasApiHost | null } = { host: this };
  private disposed = false;
  private started = false;
  private readonly capabilities: ReadonlySet<AtlasCapability>;

  constructor(private readonly options: ApiHostOptions) {
    this.capabilities = new Set<AtlasCapability>(options.capabilities);
    const capabilities = this.capabilities;
    this.api = Object.freeze({
      version: API_VERSION,
      has: (capability: AtlasCapability): boolean => capabilities.has(capability),
      connect: (plugin: ConnectingPlugin): AtlasExtension => this.connect(plugin),
    });
  }

  /** The events every facade emits through. */
  get apiEvents(): ApiEvents {
    return this.events;
  }

  publish(): void {
    if (this.disposed) return;
    this.options.app.workspace.trigger('atlas-vtt:api-ready', this.api);
  }

  /** Atlas is unloading: tell every extension, dispose all their registrations, then say so on the workspace. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.emit('unload');
    for (const { disposers } of this.connected.values()) disposers.disposeAll();
    this.connected.clear();
    this.link.host = null;
    this.options.app.workspace.trigger('atlas-vtt:api-unload');
  }

  listenerCount(): number {
    return this.events.size;
  }

  private connect(plugin: ConnectingPlugin): AtlasExtension {
    if (this.disposed) throw new Error('[Atlas API] connect: Atlas VTT has unloaded; wait for atlas-vtt:api-ready.');
    const id = (plugin as Partial<ConnectingPlugin> | null | undefined)?.manifest?.id;
    if (typeof id !== 'string' || id === '') {
      throw new Error('[Atlas API] connect: connect(plugin) needs an Obsidian plugin with a manifest id.');
    }
    if (typeof plugin.register !== 'function') {
      throw new Error('[Atlas API] connect: connect(plugin) needs an Obsidian plugin with a register function.');
    }
    if (!this.started) {
      this.started = true;
      this.options.onFirstConnect?.();
    }
    this.connected.get(id)?.disposers.disposeAll();
    const disposers = new DisposerSet();
    this.connected.set(id, { plugin, disposers });
    if (!this.registered.has(plugin)) {
      this.registered.add(plugin);
      const link = this.link;
      plugin.register(() => link.host?.release(id, plugin));
    }
    return this.options.build({ id, disposers, events: this.events, capabilities: this.capabilities });
  }

  /** The extension plugin unloaded: dispose its current connection, unless a newer plugin object took the id. */
  private release(id: string, plugin: ConnectingPlugin): void {
    const entry = this.connected.get(id);
    // Its register() callbacks have run: a later connect with the same object registers again.
    this.registered.delete(plugin);
    if (entry?.plugin !== plugin) return;
    entry.disposers.disposeAll();
    this.connected.delete(id);
  }
}
