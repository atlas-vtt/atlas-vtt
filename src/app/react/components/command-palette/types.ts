import type React from 'react';

export interface CommandOption {
  id: string;
  icon: React.ReactNode | null;
  label: string;
  keywords?: string[];
  shortcut?: string;
  section: string;
  action?: () => void;
  isToggle?: boolean;
  isActive?: boolean;
  hasSubmenu?: boolean;
  submenu?: CommandOption[];
}

/** Pages the palette expands into in place of its command list. */
export const SETTINGS_PANEL_IDS = [
  'scene-snapshots',
  'grid-settings',
  'token-settings',
  'widget-settings',
  'local-player-view-settings',
  'dice-settings',
  'experimental-features',
  'addon-settings',
] as const;

export type SettingsPanelId = (typeof SETTINGS_PANEL_IDS)[number];

export function isSettingsPanelId(id: string | null): id is SettingsPanelId {
  return id !== null && (SETTINGS_PANEL_IDS as readonly string[]).includes(id);
}
