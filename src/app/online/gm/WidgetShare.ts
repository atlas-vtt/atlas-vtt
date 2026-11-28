import type { GmMessage, SharedWidget, SharedWidgetBar } from '../protocol/index.ts';
import type { ViewState } from '../../types/viewState';
import { timerDeadline } from '../../utils/timerWidget';
import { playable, type SceneState, type SceneStore } from './atlasView.ts';
import { Feed, type FeedPorts, type FeedScene } from './feed/Feed.ts';
import type { FeedOut } from './feed/feedOutbox.ts';
import { listedWidgets, type ListedBar } from './widgetInputs.ts';

export interface WidgetSharePorts extends FeedPorts {
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
 * starts, pauses, resets or changes it, or it runs out. Sent again, it says how long ago as of then. A
 * scene starts with none shown. While the scene loads, the bar stands as it was and its running timers
 * count on, as in Atlas's window.
 */
export class WidgetShare {
  readonly feed: Feed;
  /** The bar last worked out from a loaded scene. */
  private bar: ListedBar | null = null;

  constructor(private readonly store: SceneStore, private readonly ports: WidgetSharePorts) {
    this.feed = new Feed(ports, {
      interval: WIDGET_INTERVAL_MS,
      build: (scene, out) => this.build(scene, out),
      reset: () => {
        this.bar = null;
      },
      opened: () => this.update(),
      again: ({ key }) => (key === NONE ? null : this.message(this.feed.scene?.id ?? '', Date.now()).body),
    });
  }

  /** The widgets go out now, or once the interval has passed. */
  update(): void {
    if (this.feed.scene === null || !this.store.getState().mapLoaded) return;
    this.feed.update();
  }

  private build(scene: FeedScene, out: FeedOut): void {
    const state: WidgetState = this.store.getState();
    if (!state.mapLoaded) return;
    if (playable(state)) this.bar = listedWidgets(state, this.ports.showWidgets());
    const { body, key } = this.message(scene.id, Date.now());
    if (key !== NONE || out.has('widgets')) out.send(body, key);
  }

  /** The message at `now` (epoch ms, as timers keep their runs). */
  private message(scene: string, now: number): { readonly body: GmMessage; readonly key: string } {
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
