import React from 'react';
import { cn } from '../../../../utils/cn';

interface ProgressBarProps {
  /** Finished units. */
  value: number;
  /** All units; the bar stays empty while it is 0. */
  max: number;
  /** What is in progress, for screen readers. */
  label: string;
  /** The value in words, such as "12 of 40". */
  valueText?: string;
  className?: string;
  /** Under way with nothing to count yet: a short fill glides across instead of a false zero. */
  indeterminate?: boolean;
}

/**
 * A thin bar. The fill slides with a transform, so it keeps moving smoothly on
 * the compositor while the main thread is busy; indeterminate, it names no value.
 */
export function ProgressBar({ value, max, label, valueText, className, indeterminate = false }: ProgressBarProps): React.JSX.Element {
  const done = Math.min(max, Math.max(0, value));
  const fraction = max > 0 ? done / max : 0;
  return (
    <div
      className={cn('atlas-progress-bar', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : done}
      aria-valuetext={valueText}
      data-indeterminate={indeterminate || undefined}
    >
      <div className="atlas-progress-bar__fill" style={{ '--atlas-progress': fraction } as React.CSSProperties} />
    </div>
  );
}
