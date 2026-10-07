import type { Plugin } from 'obsidian';
import type { AtlasCapability, Disposer, ViewId } from './common';
import type { DiceApi } from './dice';
import type { LasersApi } from './lasers';
import type { LightingApi } from './lighting';
import type { PresentationApi } from './presentation';
import type { RulesApi } from './rules';
import type { BundlesApi, ScenesApi } from './scenes';
import type { CollectionsApi } from './collections';
import type { AtlasSettingKey, SettingsApi, StorageApi } from './settings';
import type { TokensApi } from './tokens';
import type { UiApi } from './ui';
import type { ViewInfo, ViewsApi } from './views';
/** What `connect` needs of the calling plugin: its id, and where to register its own teardown. */
export type ConnectingPlugin = Pick<Plugin, 'manifest' | 'register'>;
/**
 * `app.plugins.plugins['atlas-vtt'].api`, set (and `atlas-vtt:api-ready` triggered) once Atlas's storage and asset index
 * have settled: loaded, or failed to load. After a failed load the API is still published; `scenes.*` calls then reject.
 */
export interface AtlasApi {
    /** Semver of this API, e.g. "1.0.0"; independent of Atlas's own version. */
    readonly version: string;
    /** Whether the running Atlas has `capability`'s namespace; false for a name it does not know. Check it before using a namespace. */
    has(capability: AtlasCapability): boolean;
    /** Scopes everything to `plugin.manifest.id`; registrations are disposed when either plugin unloads. */
    connect(plugin: ConnectingPlugin): AtlasExtension;
}
export interface AtlasEvents {
    /** Atlas is unloading; everything is disposed after this. */
    unload: () => void;
    /** A view's store holds a map, loaded and drawn; fires once per map load. */
    'map-loaded': (view: ViewInfo) => void;
    /** The view closed; its id is never reused. */
    'map-closed': (viewId: ViewId) => void;
    /** A collection's rules changed (its id), or the asset index finished loading (null: any may have). Read `rules.forMap` again. */
    'rules-changed': (collectionId: string | null) => void;
    /** A setting's value changed; read it again with `settings.get`. */
    'settings-changed': (key: AtlasSettingKey) => void;
    /** Scene records were added, removed, renamed, moved to another collection or pointed at another map. Read `scenes.list` again. */
    'scenes-changed': () => void;
    /**
     * Capability `scene-tabs`: a GM map view's tabs (added, closed, moved, renamed) or its active tab changed. Fires once per
     * view per microtask with the view as it is then. `map-loaded` and `map-closed` are unchanged.
     */
    'tabs-changed': (view: ViewInfo) => void;
    /**
     * Capability `collections`: collections were added, removed or renamed, or an extension's data on one changed
     * (`collections.setData`, by any extension). Read `collections.list` or `getData` again.
     */
    'collections-changed': () => void;
}
export interface AtlasExtension {
    /** The calling plugin's manifest id. */
    readonly id: string;
    readonly views: ViewsApi;
    readonly presentation: PresentationApi;
    readonly dice: DiceApi;
    readonly lasers: LasersApi;
    readonly lighting: LightingApi;
    readonly tokens: TokensApi;
    readonly rules: RulesApi;
    readonly settings: SettingsApi;
    readonly storage: StorageApi;
    readonly ui: UiApi;
    readonly scenes: ScenesApi;
    readonly bundles: BundlesApi;
    /** Only when `has('collections')`. */
    readonly collections?: CollectionsApi;
    /**
     * Hears an Atlas event. The listener runs guarded (a throw is logged and the other listeners still run) and is dropped
     * when this extension or Atlas unloads. A listener that is not a function, or an event Atlas does not have, registers
     * nothing and is logged.
     */
    on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): Disposer;
}
