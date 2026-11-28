import type { Viewport } from 'pixi-viewport';
import type { SettingsService } from '../services/SettingsService';
import type { NavigationInputMode } from '../services/deviceSettings';
import { SmoothWheelZoom } from './SmoothWheelZoom';

/**
 * Installs the viewport's `wheel` plugin (smooth wheel zoom) configured for the given input mode.
 *
 * The `drag` plugin is installed with its default `wheel: true`, which pans
 * on plain wheel events whenever the `wheel` plugin does not claim them for
 * zooming. So `mouse` mode (wheel always zooms) and `trackpad` mode
 * (scroll pans, Ctrl/Cmd + wheel i.e. pinch zooms) only differ in how the
 * `wheel` plugin is configured.
 */
export function applyNavigationMode(viewport: Viewport, mode: NavigationInputMode): void {
  const options = mode === 'trackpad'
    ? { wheelZoom: false, trackpadPinch: true }
    : { wheelZoom: true, trackpadPinch: false };
  viewport.plugins.add('wheel', new SmoothWheelZoom(viewport, options));
}

/**
 * Applies the current navigation mode and keeps the viewport in sync with
 * later settings changes. Returns an unsubscribe function.
 */
export function bindViewportNavigation(viewport: Viewport, settingsService: SettingsService): () => void {
  let currentMode = settingsService.get('inputMode');
  applyNavigationMode(viewport, currentMode);

  return settingsService.onChange(() => {
    const mode = settingsService.get('inputMode');
    if (mode === currentMode) return;
    currentMode = mode;
    applyNavigationMode(viewport, currentMode);
  });
}
