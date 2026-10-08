import React, { useState, useEffect, useRef, useCallback, useImperativeHandle } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useAtlasUI } from '../root/AtlasUIContext';
import type { TimerWidget } from '../../types/widgetTypes';
import type { ViewAtlasStore } from '../../storeFactory';
import { WidgetIconGlyph } from './WidgetIconGlyph';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { DEFAULT_TIMER_COLOR, formatTimerTime, resetTimer, startedTimer, timerAt, timerRun } from '../../utils/timerWidget';
import { useTimerClock } from '../hooks/useTimerClock';
import { t } from '../../i18n';

interface TimerWidgetDisplayProps {
  widget: TimerWidget;
  store: ViewAtlasStore;
  isPlayerView: boolean;
  isActive: boolean;
  isPulsing: boolean;
  pulseIntensity: number;
  position: number | null;
  shortcutLabel?: string | undefined;
  isKeyHeld: boolean;
  onInteraction: (widgetId: string) => void;
  ref?: React.Ref<TimerWidgetControls>;
}

/** What the widget bar's held-widget hotkeys can do with a timer. */
export interface TimerWidgetControls {
  togglePlay: () => void;
  reset: () => void;
}

/** Parse a user-entered time string (M:SS, MM:SS, H:MM:SS, or plain minutes) into seconds */
function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();

  // Try M:SS or MM:SS or H:MM:SS
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0]!, 10);
    const secs = parseInt(parts[1]!, 10);
    if (!isNaN(mins) && !isNaN(secs) && secs < 60) {
      return mins * 60 + secs;
    }
  }
  if (parts.length === 3) {
    const hrs = parseInt(parts[0]!, 10);
    const mins = parseInt(parts[1]!, 10);
    const secs = parseInt(parts[2]!, 10);
    if (!isNaN(hrs) && !isNaN(mins) && !isNaN(secs) && mins < 60 && secs < 60) {
      return hrs * 3600 + mins * 60 + secs;
    }
  }

  // Raw digits without colon → interpret as MMSS / MSS / SS / M
  // e.g. "0200" → 02:00, "0020" → 00:20, "0002" → 00:02, "130" → 1:30, "5" → 5:00
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length >= 3) {
      // Last two digits are seconds, rest are minutes
      const secStr = trimmed.slice(-2);
      const minStr = trimmed.slice(0, -2);
      const mins = parseInt(minStr, 10);
      const secs = parseInt(secStr, 10);
      if (secs < 60) {
        return mins * 60 + secs;
      }
    }
    // 1-2 digits → treat as minutes
    const asNum = parseInt(trimmed, 10);
    if (!isNaN(asNum) && asNum >= 0) {
      return asNum * 60;
    }
  }

  return null;
}

export function TimerWidgetDisplay({
  widget,
  store,
  isPlayerView,
  isActive,
  isPulsing,
  pulseIntensity,
  position,
  shortcutLabel,
  isKeyHeld,
  onInteraction,
  ref,
}: TimerWidgetDisplayProps): React.ReactElement | null {
  const { view } = useAtlasUI();
  const [isEditing, setIsEditing] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expireTimeoutRef = useRef<number | null>(null);

  const isRunning = timerRun(widget) !== undefined;
  const duration = widget.duration ?? 300; // default 5 min

  useEffect(() => {
    return () => {
      if (expireTimeoutRef.current) window.clearTimeout(expireTimeoutRef.current);
    };
  }, []);

  const shownSeconds = useTimerClock(store, widget, rootRef, () => {
    setIsExpired(true);
    view?.serviceManager?.getSoundEffectService?.()?.playTimerDing();
    // Clear the expired flash after 3 seconds
    if (expireTimeoutRef.current) window.clearTimeout(expireTimeoutRef.current);
    expireTimeoutRef.current = window.setTimeout(() => setIsExpired(false), 3000);
  });

  /** The timer as the store holds it now, not as this render saw it. */
  const currentTimer = useCallback((): TimerWidget | undefined => {
    const current = store.getState().widgetSettings.widgets[widget.id];
    return current?.type === 'timer' ? current : undefined;
  }, [store, widget.id]);

  const handlePlayPause = useCallback((): void => {
    onInteraction(widget.id);
    const current = currentTimer();
    if (!current) return;
    const now = Date.now();
    store.getState().setTimerState(widget.id, timerRun(current) ? timerAt(current, now) : startedTimer(current, now));
    setIsExpired(false);
  }, [widget.id, store, onInteraction, currentTimer]);

  const handleReset = useCallback((): void => {
    onInteraction(widget.id);
    setIsExpired(false);
    const current = currentTimer();
    if (current) store.getState().setTimerState(widget.id, resetTimer(current));
  }, [widget.id, store, onInteraction, currentTimer]);

  useImperativeHandle(ref, () => ({ togglePlay: handlePlayPause, reset: handleReset }), [handlePlayPause, handleReset]);

  const handleTimeClick = useCallback((): void => {
    if (isPlayerView || isRunning) return;
    onInteraction(widget.id);
    setIsEditing(true);
  }, [isPlayerView, isRunning, widget.id, onInteraction]);

  const commitEdit = useCallback((save: boolean): void => {
    if (save && inputRef.current) {
      const seconds = parseTimeInput(inputRef.current.value);
      if (seconds !== null && seconds > 0) {
        store.getState().updateWidget(widget.id, {
          value: seconds,
          duration: seconds,
        });
      }
    }
    setIsEditing(false);
  }, [store, widget.id]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const widgetClasses = [
    'atlas-widget',
    'atlas-widget-timer',
    isActive ? 'widget-active' : '',
    isPulsing ? `widget-pulse pulse-intensity-${pulseIntensity}` : '',
    isKeyHeld ? 'widget-key-held' : '',
    isRunning ? 'timer-running' : '',
    isExpired ? 'timer-expired' : '',
  ].filter(Boolean).join(' ');

  const color = widget.color || DEFAULT_TIMER_COLOR;

  return (
    <div
      ref={rootRef}
      className={widgetClasses}
      style={{ '--widget-color': color, '--pulse-intensity': pulseIntensity } as React.CSSProperties}
    >
      <div className="atlas-widget-icon-wrapper">
        <WidgetIconGlyph icon={widget.icon} />
      </div>

      <div className="atlas-widget-content">
        <div className="atlas-widget-value-row">
          {/* GM-only controls: play/pause */}
          {!isPlayerView && (
            <LabelTooltip label={isRunning ? t('timer.pause') : t('timer.start')}>
              <button
                onClick={handlePlayPause}
                className="atlas-timer-btn"
              >
                {isRunning ? <Pause /> : <Play />}
              </button>
            </LabelTooltip>
          )}

          {/* Time display / edit */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="atlas-timer-edit-input"
              defaultValue={formatTimerTime(duration)}
              placeholder={t('timer.placeholder')}
              onBlur={() => commitEdit(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(true);
                if (e.key === 'Escape') commitEdit(false);
              }}
            />
          ) : (
            <span
              className={`atlas-timer-display ${!isPlayerView && !isRunning ? 'editable' : ''}`}
              onClick={handleTimeClick}
            >
              {formatTimerTime(shownSeconds)}
            </span>
          )}

          {/* GM-only controls: reset */}
          {!isPlayerView && (
            <LabelTooltip label={t('common.reset')}>
              <button
                onClick={handleReset}
                className="atlas-timer-btn"
              >
                <RotateCcw />
              </button>
            </LabelTooltip>
          )}
        </div>

        <div className="atlas-widget-label">
          <span className="atlas-widget-label-text">{widget.label}</span>
          {position && (
            <span className="atlas-widget-shortcut">{shortcutLabel ?? position}</span>
          )}
        </div>
      </div>
    </div>
  );
}
