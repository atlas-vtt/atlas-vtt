import type { App, Plugin } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ComponentType } from 'react';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from '../settings/settingSections';
import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import type { LayerVisibility } from '../pixi/playerSafeFrame';
import type { PinAddonHooks } from './hooks/pinHooks';
import type { DrawingAddonHooks } from './hooks/drawingHooks';

/**
 * Add-ons extend Atlas without editing core files. Each add-on is a folder
 * `src/addons/<name>/` with an `addon.ts` whose default export is an
 * `AtlasAddon`; the folder is found at build time, so adding or removing one
 * (or merging an add-on branch) never touches core. Every hook is optional;
 * the hooks of each area live in `hooks/`.
 */
export interface AtlasAddon extends PinAddonHooks, DrawingAddonHooks {
  /** Stable id, also the key of the add-on's object mask and settings. */
  id: string;
  /** Lower runs first (menu entries, toolbar bars); default 100. */
  order?: number;

  /** Plugin load: register views, commands and ribbon icons on `plugin` (Obsidian cleans them up). */
  onload?(plugin: Plugin, settings: SettingsService): void;
  /** Plugin unload: release shared services. */
  onunload?(): void;
  /** Sections the add-on adds to the Atlas settings tab. */
  settingsSections?(app: App, settings: SettingsService): AtlasSettingSection[];

  /** Per-scene state merged into every view store. */
  store?: AddonStoreSlice;

  /** Entries for a map object's context menu, shown before Duplicate/Delete. */
  objectMenuEntries?(store: StoreApi<ViewAtlasState>, kind: AddonObjectKind, id: string, context: ObjectMenuContext): ContextMenuEntry[];
  /** A bar shown above the bottom toolbar (GM view only). */
  ToolbarAbove?: ComponentType;
  /** A layer over the whole map, for bars placed anywhere on it (GM view only). */
  MapOverlay?: ComponentType;
  /** Entries for the map's More options menu, shown before Close. */
  viewActionEntries?(app: App): ContextMenuEntry[];
  /** Replaces the scene's background image; null/undefined = no opinion. */
  backgroundOverride?(state: ViewAtlasState): string | null | undefined;
  /** Canvas-side part, created once the view's renderers exist. */
  createRenderer?(context: AddonRendererContext): AddonRenderer;
}

/**
 * State add-ons put in the view store, one entry per add-on. Each add-on adds
 * its entry from its own folder (`declare module 'src/app/addons/AtlasAddon'`),
 * so its fields are typed on `ViewAtlasState` only while it is installed.
 */
export interface AddonStateRegistry {
  core: object;
}

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;

/** All add-on store fields together. */
export type AddonViewState = UnionToIntersection<AddonStateRegistry[keyof AddonStateRegistry]>;

export type AddonObjectKind = 'pin' | 'token' | 'text' | 'drawing';

/** Where an object's context menu opened. */
export interface ObjectMenuContext {
  /** The view's zoom, when the menu opened on the canvas. */
  zoom?: number;
  /** The Obsidian app, for menu entries that open dialogs. */
  app?: App;
}

/** Immer setter of the view store: add-ons edit their own state and the map objects. */
export type AddonImmerSet = (fn: (draft: AddonViewState & Pick<ViewAtlasState, 'objects' | 'addonRevision'>) => void) => void;

export interface AddonStoreSlice {
  /** Initial (and per-map reset) state; keys must not clash with core state. */
  initialState(): Record<string, unknown>;
  actions?(set: AddonImmerSet, get: () => ViewAtlasState): Record<string, unknown>;
  /** Fields saved in the scene file; return {} to save nothing. */
  persist?(state: ViewAtlasState): Record<string, unknown>;
  /** Checks the saved fields when a scene loads. */
  restore?(saved: Record<string, unknown>): Record<string, unknown>;
}

export interface AddonRendererContext {
  app: App;
  viewport: Viewport;
  store: ViewAtlasStore;
  isPlayerView: boolean;
}

export interface AddonRenderer {
  destroy(): void;
  /** Layers a player frame must hide or change. */
  playerViewLayers?(): LayerVisibility[];
}
