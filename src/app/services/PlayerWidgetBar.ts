import type { ViewAtlasState } from '../storeFactory';
import type { AnyWidget, ClockWidget, CounterWidget, TimerWidget } from '../types/widgetTypes';
import { WIDGET_ICON_PATHS, WIDGET_ICON_VIEW_BOX, resolveWidgetIcon } from '../types/widgetIcons';
import { DEFAULT_COUNTER_COLOR, readCounterValue } from '../utils/counterWidget';
import { isWidgetOn } from '../utils/widgetActivation';
import { DEFAULT_TIMER_COLOR, formatTimerTime, isTimerExpired, msUntilNextSecond, timerRun, timerShownSeconds } from '../utils/timerWidget';
import { CLOCK_VIEW_SIZE, DEFAULT_CLOCK_COLOR, clockFace, clockProgressLabel } from '../utils/clockWidget';
import { PlayerSceneOverlay, type PlayerSettings } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';
import { playersListShape, type PlayersListShape } from '../initiative/initiativeLayout';
import { playTurnMotion, snapshotTurn, TURN_KEY_ATTRIBUTE } from '../initiative/motion/turnMotion';

/**
 * Set on the overlays' layer while the widgets stand as a column: the room they take from the right edge, which the
 * players' rows leave free on both sides (`player-initiative.scss`).
 */
const WIDGETS_ROOM = '--atlas-player-widgets-room';
/** The widgets' distance from the edge and the rows' gap to them (`widget-bar.scss`, `$spacing-m`). */
const WIDGETS_OFFSET_PX = 8;
const ROWS_GAP_PX = 12;

type WidgetScene = Pick<ViewAtlasState, 'widgetSettings' | 'widgetValues'>;

/**
 * Read-only widget bar showing the presented scene's player-visible widgets. While the players' initiative list runs
 * as rows across the top and bottom, the widgets stand as a column down the right edge, and the rows keep clear of it.
 */
export class PlayerWidgetBar extends PlayerSceneOverlay<WidgetScene> {
  /** The shown running timers, whose time this bar counts itself between store changes. */
  private runningTimers: { widget: TimerWidget; display: HTMLElement }[] = [];
  private tickTimeout: number | undefined;
  private shape: PlayersListShape;
  private readonly stopLayout: () => void;
  /** Follows the column's width into `WIDGETS_ROOM` on the overlays' layer. */
  private roomWatch: ResizeObserver | undefined;
  private roomLayer: HTMLElement | undefined;
  /** The bar drawn last, which the next drawing's widgets glide from. */
  private bar: HTMLElement | undefined;

  constructor(private readonly settings: SettingsService) {
    super({ cls: 'atlas-vtt-plugin', attr: { id: 'atlas-player-widgets' } }, settings);
    this.shape = playersListShape(settings.initiativeLayout());
    // The GM's layout is no player setting: the widgets are laid out anew when the players' list changes shape
    this.stopLayout = settings.onChange(() => {
      const shape = playersListShape(settings.initiativeLayout());
      if (shape === this.shape) return;
      this.shape = shape;
      this.refresh();
    });
  }

  protected select({ widgetSettings, widgetValues }: ViewAtlasState): WidgetScene {
    return { widgetSettings, widgetValues };
  }

  protected render(container: HTMLElement, scene: WidgetScene, settings: PlayerSettings): void {
    const { widgetSettings } = scene;
    if (!settings.showWidgets || !widgetSettings?.globalVisible) return;

    const widgets = Object.values(widgetSettings.widgets)
      .filter((widget) => isWidgetOn(widgetSettings, widget) && widget.visibleToPlayers)
      .sort((a, b) => a.order - b.order);
    if (widgets.length === 0) return;

    const column = this.shape === 'horizontal';
    const widgetBar = container.createDiv({ cls: column ? 'atlas-widget-bar atlas-widget-bar--column' : 'atlas-widget-bar' });
    this.bar = widgetBar;
    const widgetContainer = widgetBar.createDiv({ cls: 'atlas-widget-container' });
    const scale = widgetSettings.scale || 1;
    widgetContainer.style.transform = `scale(${scale})`;
    for (const widget of widgets) {
      if (widget.type === 'timer') this.renderTimer(widgetContainer, widget);
      else if (widget.type === 'clock') this.renderClock(widgetContainer, widget, readCounterValue(scene, widget));
      else this.renderCounter(widgetContainer, widget, readCounterValue(scene, widget));
    }
    if (column) this.watchRoom(container, widgetContainer, scale);
    this.tick();
  }

  /**
   * Draws anew. The widgets glide from where they stood to their new places (a row becoming a column as the players'
   * list turns horizontal, and back), read from the bar's top right corner, where it is anchored.
   */
  override refresh(): void {
    this.stopTicking();
    this.releaseRoom();
    const before = this.bar ? snapshotTurn(this.bar, { fromRight: true }) : null;
    this.bar = undefined;
    super.refresh();
    if (before && this.bar) playTurnMotion(this.bar, before, { fromRight: true, wrap: false });
  }

  override destroy(): void {
    this.stopTicking();
    this.releaseRoom();
    this.stopLayout();
    super.destroy();
  }

  /**
   * Publishes the room the column takes from the right edge on the overlays' layer, followed as the widgets change
   * size. The column is scaled from its top right corner, so its width scales as it is.
   */
  private watchRoom(container: HTMLElement, column: HTMLElement, scale: number): void {
    const layer = container.parentElement;
    const Observer = container.ownerDocument.defaultView?.ResizeObserver;
    if (!layer || !Observer) return;
    this.roomLayer = layer;
    const publish = (): void => layer.style.setProperty(WIDGETS_ROOM, `${column.offsetWidth * scale + WIDGETS_OFFSET_PX + ROWS_GAP_PX}px`);
    publish();
    this.roomWatch = new Observer(publish);
    this.roomWatch.observe(column);
  }

  private releaseRoom(): void {
    this.roomWatch?.disconnect();
    this.roomWatch = undefined;
    this.roomLayer?.style.removeProperty(WIDGETS_ROOM);
    this.roomLayer = undefined;
  }

  private renderCounter(parent: HTMLElement, widget: CounterWidget, value: number): void {
    const valueRow = this.renderWidget(parent, widget, 'atlas-widget-counter', DEFAULT_COUNTER_COLOR);
    valueRow.createSpan({ cls: 'atlas-widget-value', text: String(value) });
  }

  private renderClock(parent: HTMLElement, widget: ClockWidget, value: number): void {
    const typeClass = value >= widget.segments ? 'atlas-widget-clock clock-complete' : 'atlas-widget-clock';
    const valueRow = this.renderWidget(parent, widget, typeClass, DEFAULT_CLOCK_COLOR);
    const face = valueRow.createSvg('svg', {
      cls: 'atlas-clock-face',
      attr: {
        viewBox: `0 0 ${CLOCK_VIEW_SIZE} ${CLOCK_VIEW_SIZE}`,
        role: 'img',
        'aria-label': clockProgressLabel(widget.label, value, widget.segments),
      },
    });
    const { wedges, count } = clockFace(widget.segments, value, widget.showCount === true);
    wedges.forEach((d, index) => {
      // Obsidian adds an SVG element's string class as one token, so several classes need an array.
      face.createSvg('path', { cls: index < value ? ['atlas-clock-wedge', 'is-filled'] : 'atlas-clock-wedge', attr: { d } });
    });
    if (count) {
      face.createSvg('text', {
        cls: 'atlas-clock-count',
        attr: { x: '50%', y: '50%', 'font-size': count.fontSize, 'aria-hidden': 'true' },
      }).textContent = count.text;
    }
  }

  /** A running timer's time comes from the wall clock, so the bar counts it down without store changes. */
  private renderTimer(parent: HTMLElement, widget: TimerWidget): void {
    const valueRow = this.renderWidget(parent, widget, 'atlas-widget-timer', DEFAULT_TIMER_COLOR);
    const display = valueRow.createSpan({ cls: 'atlas-timer-display', text: formatTimerTime(timerShownSeconds(widget, Date.now())) });
    if (timerRun(widget)) this.runningTimers.push({ widget, display });
  }

  /** Shows the running timers' time and waits for their next second; a hidden window's late ticks catch up. */
  private tick(): void {
    window.clearTimeout(this.tickTimeout);
    const now = Date.now();
    for (const { widget, display } of this.runningTimers) {
      display.setText(formatTimerTime(timerShownSeconds(widget, now)));
    }
    // A timer that has run out stays at 0 until the DM's view stops it.
    this.runningTimers = this.runningTimers.filter(({ widget }) => !isTimerExpired(widget, now));
    if (this.runningTimers.length === 0) return;
    const next = Math.min(...this.runningTimers.map(({ widget }) => msUntilNextSecond(widget, now)));
    this.tickTimeout = window.setTimeout(() => this.tick(), next);
  }

  private stopTicking(): void {
    window.clearTimeout(this.tickTimeout);
    this.tickTimeout = undefined;
    this.runningTimers = [];
  }

  /**
   * Appends a widget's frame, icon and label to `parent` and returns the row for
   * its value. Building it through the parent keeps it in the popout's document,
   * where Obsidian installs the same DOM helpers.
   */
  private renderWidget(parent: HTMLElement, widget: AnyWidget, typeClass: string, defaultColor: string): HTMLElement {
    const widgetEl = parent.createDiv({ cls: `atlas-widget ${typeClass}`, attr: { [TURN_KEY_ATTRIBUTE]: `widget:${widget.id}` } });
    widgetEl.style.setProperty('--widget-color', widget.color || defaultColor);
    widgetEl.createDiv({ cls: 'atlas-widget-icon-wrapper' })
      .createSvg('svg', { attr: { viewBox: WIDGET_ICON_VIEW_BOX, fill: 'currentColor' } })
      .createSvg('path', { attr: { d: WIDGET_ICON_PATHS[resolveWidgetIcon(widget.icon)] } });

    const content = widgetEl.createDiv({ cls: 'atlas-widget-content' });
    const valueRow = content.createDiv({ cls: 'atlas-widget-value-row' });
    content.createDiv({ cls: 'atlas-widget-label', text: widget.label });
    return valueRow;
  }
}
