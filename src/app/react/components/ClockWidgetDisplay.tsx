import React, { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { Plus, Minus } from 'lucide-react';
import type { ClockWidget } from '../../types/widgetTypes';
import type { ViewAtlasStore } from '../../storeFactory';
import { clampCounterValue, readCounterValue, stepCounter } from '../../utils/counterWidget';
import {
  CLOCK_VIEW_SIZE,
  DEFAULT_CLOCK_COLOR,
  clockFace,
  clockProgressLabel,
  clockValueForWedge,
} from '../../utils/clockWidget';
import { WidgetIconGlyph } from './WidgetIconGlyph';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

interface ClockWidgetDisplayProps {
  widget: ClockWidget;
  store: ViewAtlasStore;
  isActive: boolean;
  isPulsing: boolean;
  pulseIntensity: number;
  position: number | null;
  shortcutLabel?: string | undefined;
  isKeyHeld: boolean;
  onInteraction: (widgetId: string) => void;
  onValueChange: (widgetId: string) => void;
}

/** A progress clock: the GM fills its wedges with the buttons or by clicking a wedge. */
export function ClockWidgetDisplay({
  widget,
  store,
  isActive,
  isPulsing,
  pulseIntensity,
  position,
  shortcutLabel,
  isKeyHeld,
  onInteraction,
  onValueChange,
}: ClockWidgetDisplayProps): React.ReactElement {
  const value = useStore(store, (state) => readCounterValue(state, widget));
  const face = clockFace(widget.segments, value, widget.showCount === true);
  const previousValue = useRef(value);

  // Pulse on every change, including ones synced from other views or undo/redo.
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    onValueChange(widget.id);
  }, [value, widget.id, onValueChange]);

  const step = (delta: number): void => {
    stepCounter(store, widget.id, delta);
    onInteraction(widget.id);
  };

  const setFromWedge = (index: number): void => {
    store.getState().setWidgetValue(widget.id, clampCounterValue(widget, clockValueForWedge(index, value)));
    onInteraction(widget.id);
  };

  const widgetClasses = [
    'atlas-widget',
    'atlas-widget-clock',
    value >= widget.segments ? 'clock-complete' : '',
    isActive ? 'widget-active' : '',
    isPulsing ? `widget-pulse pulse-intensity-${pulseIntensity}` : '',
    isKeyHeld ? 'widget-key-held' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={widgetClasses}
      style={{ '--widget-color': widget.color || DEFAULT_CLOCK_COLOR, '--pulse-intensity': pulseIntensity } as React.CSSProperties}
    >
      <div className="atlas-widget-icon-wrapper">
        <WidgetIconGlyph icon={widget.icon} />
      </div>
      <div className="atlas-widget-content">
        <div className="atlas-widget-value-row">
          <LabelTooltip label={t('clock.clear')}>
            <button onClick={() => step(-1)} className="atlas-widget-btn">
              <Minus />
            </button>
          </LabelTooltip>
          <svg
            className="atlas-clock-face"
            viewBox={`0 0 ${CLOCK_VIEW_SIZE} ${CLOCK_VIEW_SIZE}`}
            role="img"
            aria-label={clockProgressLabel(widget.label, value, widget.segments)}
          >
            {face.wedges.map((path, index) => (
              <path
                key={index}
                d={path}
                className={index < value ? 'atlas-clock-wedge is-filled' : 'atlas-clock-wedge'}
                onClick={() => setFromWedge(index)}
              />
            ))}
            {face.count && (
              <text x="50%" y="50%" className="atlas-clock-count" fontSize={face.count.fontSize} aria-hidden="true">
                {face.count.text}
              </text>
            )}
          </svg>
          <LabelTooltip label={t('clock.fill')}>
            <button onClick={() => step(1)} className="atlas-widget-btn">
              <Plus />
            </button>
          </LabelTooltip>
        </div>
        <div className="atlas-widget-label">
          <span className="atlas-widget-label-text">{widget.label}</span>
          {position && <span className="atlas-widget-shortcut">{shortcutLabel ?? position}</span>}
        </div>
      </div>
    </div>
  );
}
