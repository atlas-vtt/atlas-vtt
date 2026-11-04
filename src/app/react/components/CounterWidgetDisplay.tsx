import React, { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Plus, Minus } from 'lucide-react';
import type { CounterWidget } from '../../types/widgetTypes';
import type { ViewAtlasStore } from '../../storeFactory';
import { DEFAULT_COUNTER_COLOR, clampCounterValue, readCounterValue, stepCounter } from '../../utils/counterWidget';
import { WidgetIconGlyph } from './WidgetIconGlyph';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

interface CounterWidgetDisplayProps {
  widget: CounterWidget;
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

export function CounterWidgetDisplay({
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
}: CounterWidgetDisplayProps): React.ReactElement {
  const value = useStore(store, (state) => readCounterValue(state, widget));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousValue = useRef(value);

  // Pulse on every change, including ones synced from other views or undo/redo.
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    onValueChange(widget.id);
  }, [value, widget.id, onValueChange]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const step = (delta: number): void => {
    stepCounter(store, widget.id, delta);
    onInteraction(widget.id);
  };

  const commitEdit = (save: boolean): void => {
    const parsed = parseInt(inputRef.current?.value ?? '', 10);
    if (save && !isNaN(parsed)) {
      store.getState().setWidgetValue(widget.id, clampCounterValue(widget, parsed));
      onInteraction(widget.id);
    }
    setIsEditing(false);
  };

  const color = widget.color || DEFAULT_COUNTER_COLOR;
  const widgetClasses = [
    'atlas-widget',
    'atlas-widget-counter',
    isActive ? 'widget-active' : '',
    isPulsing ? `widget-pulse pulse-intensity-${pulseIntensity}` : '',
    isKeyHeld ? 'widget-key-held' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={widgetClasses}
      style={{ '--widget-color': color, '--pulse-intensity': pulseIntensity } as React.CSSProperties}
    >
      <div className="atlas-widget-icon-wrapper">
        <WidgetIconGlyph icon={widget.icon} />
      </div>
      <div className="atlas-widget-content">
        <div className="atlas-widget-value-row">
          <LabelTooltip label={t('counter.decrease')}>
            <button onClick={() => step(-1)} className="atlas-widget-btn">
              <Minus />
            </button>
          </LabelTooltip>
          {isEditing ? (
            <input
              ref={inputRef}
              type="number"
              className="atlas-widget-value-input"
              defaultValue={value}
              min={widget.min ?? 0}
              max={widget.max ?? 99}
              autoFocus
              onBlur={() => commitEdit(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(true);
                if (e.key === 'Escape') commitEdit(false);
              }}
            />
          ) : (
            <span
              className="atlas-widget-value editable"
              onClick={() => {
                onInteraction(widget.id);
                setIsEditing(true);
              }}
            >
              {value}
            </span>
          )}
          <LabelTooltip label={t('counter.increase')}>
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
