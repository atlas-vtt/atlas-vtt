import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PlayerWindowService } from './PlayerWindowService';
import { PlayerLootWindow } from '../react/components/loot/PlayerLootWindow';
import { MOTION_EASE_OUT, MOTION_NORMAL_MS } from '../utils/motion';
import type { LootDraw } from '../loot/lootRoller';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

type Listener = (shownIds: ReadonlySet<string>) => void;

/** Another place players are handed loot; true where it took the item. */
export type LootOutlet = (draw: LootDraw) => boolean;

/** The mounted handout in the player window. */
interface Mounted {
  win: Window;
  host: HTMLElement;
  root: Root;
  detach: () => void;
}

/**
 * The loot window players see: items the DM hands out one by one from the
 * loot roller, stacked in one panel at the top of the player window. Players
 * close it by clicking outside it or pressing Escape in the player window.
 */
export class PlayerLootDisplay {
  private static instance: PlayerLootDisplay | undefined;

  static get(): PlayerLootDisplay {
    this.instance ??= new PlayerLootDisplay();
    return this.instance;
  }

  private items: LootDraw[] = [];
  /** Items handed out through the outlet, while no player window shows them. */
  private handed = new Set<string>();
  private outlet: LootOutlet | null = null;
  private mounted: Mounted | null = null;
  private readonly listeners = new Set<Listener>();

  private constructor() {}

  /** Ids of the items players currently see. */
  shownIds(): ReadonlySet<string> {
    return new Set([...this.items.map((item) => item.id), ...this.handed]);
  }

  /** Whether the player window shows the loot window now; `close` takes it away. */
  showsInWindow(): boolean {
    return this.items.length > 0;
  }

  /** Hands every item out through `outlet` too, besides the player window; null takes it away. */
  setOutlet(outlet: LootOutlet | null): void {
    this.outlet = outlet;
    if (outlet !== null || this.handed.size === 0) return;
    this.handed = new Set();
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hands an item to the players, or takes it back when they already see it. */
  toggle(draw: LootDraw): void {
    if (this.shownIds().has(draw.id)) {
      this.handed.delete(draw.id);
      this.setItems(this.items.filter((item) => item.id !== draw.id));
      return;
    }
    const handed = this.outlet?.(draw) === true;
    if (handed) this.handed.add(draw.id);
    const win = PlayerWindowService.getInstance()?.getWindow();
    if (!win) {
      if (handed) this.notify();
      else showNotice(t('loot.openPlayerView'));
      return;
    }
    // Rebuilt in a new player window, or when the page dropped it.
    if (this.mounted && (this.mounted.win !== win || !this.mounted.host.isConnected)) this.unmount();
    this.setItems([...this.items, draw]);
  }

  /** Closes the loot window in the player view. */
  close(): void {
    this.setItems([]);
  }

  /** Removes the loot window at once, when the plugin unloads. */
  dispose(): void {
    this.unmount();
    this.items = [];
    this.handed = new Set();
    this.notify();
  }

  private setItems(items: LootDraw[]): void {
    this.items = items;
    if (items.length > 0) this.render();
    else this.leave();
    this.notify();
  }

  private notify(): void {
    const shown = this.shownIds();
    for (const listener of this.listeners) listener(shown);
  }

  private render(): void {
    const win = PlayerWindowService.getInstance()?.getWindow();
    if (!win) {
      this.items = [];
      return;
    }
    this.mounted ??= this.mount(win);
    this.mounted.root.render(createElement(PlayerLootWindow, { items: this.items, onClose: () => this.close() }));
  }

  private mount(win: Window): Mounted {
    const host = win.document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-player-loot-host' });
    const root = createRoot(host);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      this.close();
    };
    // A closed player window takes the handout with it.
    const onUnload = (): void => this.dispose();
    win.document.addEventListener('keydown', onKeyDown);
    win.addEventListener('beforeunload', onUnload);
    return {
      win,
      host,
      root,
      detach: () => {
        win.document.removeEventListener('keydown', onKeyDown);
        win.removeEventListener('beforeunload', onUnload);
      },
    };
  }

  /** Fades the loot window out, then removes it; a new one may open meanwhile. */
  private leave(): void {
    const mounted = this.mounted;
    if (!mounted) return;
    this.mounted = null;
    mounted.detach();
    // Clicks pass through it while it leaves, as with panels built with the DOM (panelMotion.ts).
    mounted.host.addClass('atlas-panel-leaving');
    const fade = mounted.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION_NORMAL_MS, easing: MOTION_EASE_OUT, fill: 'forwards' });
    void fade.finished.catch(() => undefined).then(() => {
      mounted.root.unmount();
      mounted.host.remove();
    });
  }

  private unmount(): void {
    const mounted = this.mounted;
    if (!mounted) return;
    this.mounted = null;
    mounted.detach();
    mounted.root.unmount();
    mounted.host.remove();
  }
}
