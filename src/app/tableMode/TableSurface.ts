import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import { t } from '../i18n';
import type { PressClock } from '../input/longPress';
import type { PlayerOverlay } from '../services/PlayerSceneOverlay';
import type { PlayerOverlaySources } from '../services/playerOverlaySources';
import { PlayerDiceRolls } from '../services/PlayerDiceRolls';
import { PlayerInitiativePanel } from '../services/PlayerInitiativePanel';
import { PlayerTurnBanner } from '../services/PlayerTurnBanner';
import { PlayerWidgetBar } from '../services/PlayerWidgetBar';
import type { SettingsService } from '../services/SettingsService';
import type { ViewAtlasState } from '../storeFactory';
import { CHIP_HOLD_MS, holdToLeave } from './holdToLeave';

/** The element Table mode puts over the map; also what tells the map's shortcuts to rest (`canRunMapHotkeys`). */
export const TABLE_SURFACE_CLASS = 'atlas-table-surface';
/** On the surface while the scene under it is not whole: it is black until the scene is. */
const COVERED_CLASS = 'atlas-table-surface--covered';
const RING_BOX = 44;
const RING_RADIUS = 20;

/**
 * What Table mode shows over the map: the players' widgets, initiative list, dice rolls and turn
 * banner, each the player window's own overlay, and the GM chip that leads back. Nothing of it
 * takes a press but the chip, so the map under it pans and zooms.
 */
export class TableSurface {
  private readonly el: HTMLElement;
  private readonly overlays: PlayerOverlay[];
  private readonly stopChip: () => void;

  constructor(root: HTMLElement, app: App, settings: SettingsService, onLeave: () => void) {
    this.el = root.createDiv({ cls: `atlas-vtt-plugin ${TABLE_SURFACE_CLASS}` });
    const layer = this.el.createDiv({ cls: 'atlas-table-surface__overlays' });
    this.overlays = [
      new PlayerWidgetBar(settings),
      new PlayerInitiativePanel(app, settings),
      new PlayerDiceRolls(app, settings),
      new PlayerTurnBanner(app, settings),
    ];
    for (const overlay of this.overlays) overlay.mount(layer);
    const win = root.win;
    const clock: PressClock = { setTimeout: (run, ms) => win.setTimeout(run, ms), clearTimeout: (id) => win.clearTimeout(id) };
    this.stopChip = holdToLeave(this.chip(), onLeave, clock);
  }

  /** Shows the scene the view holds now: the overlays read its store, its rolls and the numbers of its badges. */
  present(store: StoreApi<ViewAtlasState>, sources: PlayerOverlaySources | null): void {
    for (const overlay of this.overlays) overlay.present(store, sources?.diceEvents, sources?.rollSources, sources?.badgeNumbers);
  }

  /** While the view's scene is loading it is built in steps, unlit and without fog: the table sees black until it is whole. */
  setCovered(covered: boolean): void {
    this.el.toggleClass(COVERED_CLASS, covered);
  }

  destroy(): void {
    this.stopChip();
    for (const overlay of this.overlays) overlay.destroy();
    this.el.remove();
  }

  /** The chip says who it is for and nothing else; held, a ring closes around it as around a long press on the map. */
  private chip(): HTMLElement {
    const chip = this.el.createEl('button', { cls: 'atlas-table-chip', attr: { type: 'button', 'aria-label': t('table.leave') } });
    chip.style.setProperty('--atlas-table-hold', `${CHIP_HOLD_MS}ms`);
    const ring = chip.createSvg('svg', { cls: 'atlas-table-chip__ring', attr: { viewBox: `0 0 ${RING_BOX} ${RING_BOX}`, 'aria-hidden': 'true' } });
    const circle = { cx: RING_BOX / 2, cy: RING_BOX / 2, r: RING_RADIUS, pathLength: 1 };
    ring.createSvg('circle', { cls: 'atlas-table-chip__track', attr: circle });
    // The ring closes as one dash of the circle's whole length
    ring.createSvg('circle', { cls: 'atlas-table-chip__progress', attr: { ...circle, 'stroke-dasharray': 1 } });
    chip.createSpan({ cls: 'atlas-table-chip__label', text: t('table.gm') });
    // Says how the chip is used as Table mode begins, then goes
    this.el.createSpan({ cls: 'atlas-table-hint', text: t('table.hold') });
    return chip;
  }
}
