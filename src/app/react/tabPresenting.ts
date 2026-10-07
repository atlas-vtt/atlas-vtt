/**
 * What a scene tab's eye button does. While a presentation target is active (an audience
 * besides the player window) it presents the tab to that audience only; without one it
 * opens the player window.
 */
import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { presentTabInPlayerWindow } from '../services/PlayerWindowPresenter';
import { activePresentationTarget } from '../services/presentationTargets';
import { presentTabToPlayers } from '../services/presentToPlayers';

const anyTargetActive = (): boolean => activePresentationTarget() !== null;

export function presentTab(app: App, view: AtlasView, tabId: string): void {
  if (anyTargetActive()) void presentTabToPlayers(view, tabId);
  else void presentTabInPlayerWindow(app, view, tabId);
}
