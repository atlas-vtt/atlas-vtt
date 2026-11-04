import { Pacer, type PacerClock } from '../marks/index.ts';
import type { GmMessage, SharedWidget, SharedWidgetBar } from '../protocol/index.ts';
import type { ViewState } from '../../types/viewState';
import { timerDeadline } from '../../utils/timerWidget';
import type { SceneState, SceneStore } from './atlasView.ts';
import { listedWidgets, type ListedBar } from './widgetInputs.ts';

export interface WidgetSharePorts extends PacerClock {
  send(body: GmMessage, to?: string): void;
  /** The player view's widget switch (`showWidgets`). */
  showWidgets(): boolean;
}

/** The shortest time between two sends of the widgets, as for the map's other layers. */
export const WIDGET_INTERVAL_MS = 66;

/** The key of a message that shows no widgets. */
const NONE = 'none';

type WidgetState = SceneState & Partial<Pick<ViewState, 'widgetSettings' | 'widgetValues'>>;

/**
 * The widgets Atlas's player window shows, sent to all whenever what players see of them changes, at
 * most every `WIDGET_INTERVAL_MS`. A running timer goes out once with its run (the seconds it had left
 * and how long ago, by the wall clock), which the page counts down; it goes out again when the GM
 * starts, pauses, resets or changes it, or it runs out. While the scene loads, the bar stands as it
 * was and its running timers count on, as in Atlas's window.
 */
export class WidgetShare {
  private readonly store: SceneStore;
  private readonly ports: WidgetSharePorts;
  private readonly pacer: Pacer;
  private scene: string | null = null;
  /** The bar last worked out from a loaded scene. */
  private bar: ListedBar | null = null;
  /** What the last message said, with each running timer's end in place of its age; a scene starts with none shown. */
  private sentKey = NONE;
  private unsubscribe: (() => void) | null = null;

  constructor(store: SceneStore, ports: WidgetSharePorts) {
    this.store = store;
    this.ports = ports;
    this.pacer = new Pacer(ports, WIDGET_INTERVAL_MS, () => this.flush());
  }

  /** The shared scene the widgets belong to; null sends none. */
  setScene(scene: string | null): void {
    if (scene === this.scene) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.scene = scene;
    this.bar = null;
    this.sentKey = NONE;
    this.pacer.cancel();
    if (scene === null) return;
    this.unsubscribe = this.store.subscribe(() => this.update());
    this.update();
  }

  /** The widgets go out now, or once the interval has passed. */
  update(): void {
    if (this.scene === null || !this.store.getState().mapLoaded) return;
    this.pacer.request();
  }

  /** The widgets again, to one player or to all, with running timers' ages as they are now; nothing while none are shown. */
  resend(to?: string): void {
    if (this.scene !== null && this.sentKey !== NONE) this.ports.send(this.message(Date.now()).body, to);
  }

  stop(): void {
    this.setScene(null);
  }

  private flush(): void {
    const state: WidgetState = this.store.getState();
    if (this.scene === null || !state.mapLoaded) return;
    if (!state.isMapLoading) this.bar = listedWidgets(state, this.ports.showWidgets());
    const { body, key } = this.message(Date.now());
    if (key === this.sentKey) return;
    this.sentKey = key;
    this.ports.send(body);
  }

  /** The message at `now` (epoch ms, as timers keep their runs). */
  private message(now: number): { readonly body: GmMessage; readonly key: string } {
    const scene = this.scene ?? '';
    if (this.bar === null) return { body: { t: 'widgets', scene, bar: null }, key: NONE };
    const widgets: SharedWidget[] = [];
    const keyed: unknown[] = [];
    for (const { widget, run } of this.bar.widgets) {
      widgets.push(run === undefined ? widget : { ...widget, since: Math.max(0, now - run.since) });
      // A run Atlas writes anew (once a minute, for older versions) keeps its end within a millisecond.
      keyed.push(run === undefined ? widget : { ...widget, value: 0, ends: Math.round(timerDeadline(run) / 10) });
    }
    const bar: SharedWidgetBar = { scale: this.bar.scale, widgets };
    return { body: { t: 'widgets', scene, bar }, key: JSON.stringify({ scale: bar.scale, keyed }) };
  }
}
