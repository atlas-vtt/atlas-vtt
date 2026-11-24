import type { Plugin } from 'obsidian';
import type { AtlasApi, Remove, SettingMount, TokenOverlay } from './apiTypes';
import { API_VERSION } from './apiVersion';
import { appearanceSettings, tokenOverlays } from './extensionPoints';

export const API_READY_EVENT = 'atlas-vtt:api-ready';
export const API_UNLOAD_EVENT = 'atlas-vtt:api-unload';

const nothing: Remove = () => undefined;

/** An overlay as another plugin hands it in, copied so it cannot change under Atlas; `null` when it is not one. */
function readOverlay(value: unknown): TokenOverlay | null {
  if (typeof value !== 'object' || value === null) return null;
  const image: unknown = Reflect.get(value, 'image');
  const span: unknown = Reflect.get(value, 'span');
  if (typeof image !== 'string' || image === '' || typeof span !== 'number' || !Number.isFinite(span) || span <= 0) return null;
  return Object.freeze({ image, span });
}

/** The API object: frozen; what other plugins add goes when Atlas unloads (`releaseExtensions`). */
export function createAtlasApi(atlasVersion: string): AtlasApi {
  return Object.freeze({
    apiVersion: API_VERSION,
    atlasVersion,
    appearance: Object.freeze({
      addSetting: (mount: SettingMount): Remove => (typeof mount === 'function' ? appearanceSettings.add(mount) : nothing),
    }),
    tokens: Object.freeze({
      addOverlay: (overlay: TokenOverlay): Remove => {
        const read = readOverlay(overlay);
        return read ? tokenOverlays.add(read) : nothing;
      },
    }),
  });
}

/**
 * Exposes the API as `plugin.api` and announces it with `atlas-vtt:api-ready` (and its going with
 * `atlas-vtt:api-unload`), so a plugin that loaded first or later finds it either way.
 */
export function registerAtlasApi(plugin: Plugin & { api?: AtlasApi | undefined }): void {
  const { app } = plugin;
  const api = createAtlasApi(plugin.manifest.version);
  plugin.api = api;
  plugin.register(() => {
    appearanceSettings.clear();
    tokenOverlays.clear();
    plugin.api = undefined;
    app.workspace.trigger(API_UNLOAD_EVENT, api);
  });
  app.workspace.onLayoutReady(() => app.workspace.trigger(API_READY_EVENT, api));
}
