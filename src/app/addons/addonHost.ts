import type { App, Plugin } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from '../settings/settingSections';
import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import type { LayerVisibility } from '../pixi/playerSafeFrame';
import type { AddonImmerSet, AddonObjectKind, AddonRenderer, AddonRendererContext, ObjectMenuContext } from './AtlasAddon';
import { installedAddons } from './addonRegistry';

/** The calls core makes into add-ons; each is a no-op when none is installed. */

function merged(parts: ReadonlyArray<Record<string, unknown> | undefined>): Record<string, unknown> {
  return parts.reduce<Record<string, unknown>>((all, part) => ({ ...all, ...part }), {});
}

export function loadAddons(plugin: Plugin, settings: SettingsService): void {
  for (const addon of installedAddons()) addon.onload?.(plugin, settings);
}

export function unloadAddons(): void {
  for (const addon of installedAddons()) addon.onunload?.();
}

export function addonSettingsSections(app: App, settings: SettingsService): AtlasSettingSection[] {
  return installedAddons().flatMap((addon) => addon.settingsSections?.(app, settings) ?? []);
}

export function addonInitialState(): Record<string, unknown> {
  return merged(installedAddons().map((addon) => addon.store?.initialState()));
}

export function addonActions(set: AddonImmerSet, get: () => ViewAtlasState): Record<string, unknown> {
  return merged(installedAddons().map((addon) => addon.store?.actions?.(set, get)));
}

export function addonPersistedState(state: ViewAtlasState): Record<string, unknown> {
  return merged(installedAddons().map((addon) => addon.store?.persist?.(state)));
}

export function addonRestoredState(saved: Record<string, unknown>): Record<string, unknown> {
  return merged(installedAddons().map((addon) => addon.store?.restore?.(saved)));
}

export function addonObjectMenuEntries(store: StoreApi<ViewAtlasState>, kind: AddonObjectKind, id: string, context: ObjectMenuContext = {}): ContextMenuEntry[] {
  return installedAddons().flatMap((addon) => addon.objectMenuEntries?.(store, kind, id, context) ?? []);
}

export function addonViewActionEntries(app: App): ContextMenuEntry[] {
  return installedAddons().flatMap((addon) => addon.viewActionEntries?.(app) ?? []);
}

export function addonBackground(state: ViewAtlasState): string | null {
  for (const addon of installedAddons()) {
    const background = addon.backgroundOverride?.(state);
    if (background) return background;
  }
  return null;
}

/** Canvas parts of every add-on for one view, destroyed together. */
export class AddonRenderers {
  private readonly renderers: AddonRenderer[];

  constructor(context: AddonRendererContext) {
    this.renderers = installedAddons().flatMap((addon) => (addon.createRenderer ? [addon.createRenderer(context)] : []));
  }

  playerViewLayers(): LayerVisibility[] {
    return this.renderers.flatMap((renderer) => renderer.playerViewLayers?.() ?? []);
  }

  destroy(): void {
    for (const renderer of this.renderers) renderer.destroy();
    this.renderers.length = 0;
  }
}
