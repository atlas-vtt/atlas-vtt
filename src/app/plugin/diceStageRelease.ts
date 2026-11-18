import type { Plugin } from 'obsidian';
import { releaseStagePool, releaseStagePools } from '../dice3d/stagePool';
import { setShadowMapSize } from '../dice3d/stageShadow';
import { deviceProfile } from '../platform/deviceProfile';

/**
 * Gives back the WebGL context the dice of a window draw with when the window
 * closes, and every one of them when Atlas unloads: the pool lives in a module,
 * so nothing else would, and a reload would keep the old contexts and their
 * textures on the graphics card next to the new ones.
 */
export function registerDiceStageRelease(plugin: Plugin): void {
  plugin.registerEvent(plugin.app.workspace.on('window-close', (_workspaceWindow, win) => releaseStagePool(win.document)));
  plugin.register(releaseStagePools);
}

/** Tells the dice what this device spends on their shadow, before the first stage is built. */
export function applyDiceBudgets(): void {
  setShadowMapSize(deviceProfile().budgets.diceShadowMap);
}
