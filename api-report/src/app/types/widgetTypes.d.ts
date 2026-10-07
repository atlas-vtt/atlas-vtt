import type { WidgetIcon } from './widgetIcons';
export type { WidgetIcon };
export type WidgetType = 'counter' | 'clock' | 'timer';
/**
 * `scene` widgets belong to one map; `collection` widgets appear with the same value
 * in every scene of the map's collection and are stored in its settings.
 */
export type WidgetScope = 'scene' | 'collection';
export interface Widget {
    id: string;
    type: WidgetType;
    label: string;
    icon: WidgetIcon;
    /** Only older Atlas versions set this to false to hide a widget; scenes now switch widgets off with `offWidgets`. */
    visible: boolean;
    visibleToPlayers: boolean;
    value: number;
    color?: string;
    order: number;
    /** Unset means `scene`. */
    scope?: WidgetScope;
}
export interface CounterWidget extends Widget {
    type: 'counter';
    min?: number;
    max?: number;
}
export interface TimerWidget extends Widget {
    type: 'timer';
    value: number;
    duration: number;
    direction: 'down';
}
/** A progress clock (Blades in the Dark): a circle of `segments` wedges the GM fills one by one. */
export interface ClockWidget extends Widget {
    type: 'clock';
    segments: number;
    /** Draws the clock as a ring with "filled/segments" in its centre. */
    showCount?: boolean;
}
export type AnyWidget = CounterWidget | ClockWidget | TimerWidget;
/** Widgets the GM steps by hand; their value lives in the undo-tracked `widgetValues`. */
export type SteppedWidget = CounterWidget | ClockWidget;
export interface WidgetSettings {
    widgets: Record<string, AnyWidget>;
    /**
     * Widgets switched off in this scene: its own widgets keep their value while
     * off, and widgets on in every scene of the collection make an exception here.
     */
    offWidgets?: string[];
    globalVisible: boolean;
    position: 'top' | 'bottom' | 'left' | 'right';
    scale: number;
}
