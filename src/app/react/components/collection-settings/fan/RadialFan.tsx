import React, { useEffect, useRef } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { cn } from '../../../../../utils/cn';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { FanSpot } from './fanArc';

export interface FanButton {
  label: string;
  icon: React.ReactNode;
  /** A switch that is on. */
  pressed?: boolean;
  /** Opens a step of its own (a picker), which is open. */
  expanded?: boolean;
  danger?: boolean;
  /** Shown and focusable but inert, so its tooltip can say why. */
  disabled?: boolean;
  onClick: () => void;
}

interface RadialFanProps {
  buttons: readonly FanButton[];
  /** Where each button ends up, relative to the origin (`fanSpots`). */
  spots: readonly FanSpot[];
  /** The origin in px of the positioned element the fan lies in. */
  x: number;
  y: number;
  /** What the buttons act on, for screen readers. */
  label?: string | undefined;
  /** Opened from the keyboard: its first button takes focus. */
  focusFirst?: boolean;
}

/** Delay between two buttons leaving the origin, in seconds. */
const STAGGER_S = 0.028;
const ENTER_S = 0.26;
const EXIT_S = 0.12;

/** The fan's buttons, in order: an inert one too, whose name says why it is. */
const fanButtons = (fan: HTMLElement): HTMLButtonElement[] => [...fan.querySelectorAll<HTMLButtonElement>('.atlas-csm-fan__button')];

/**
 * Round buttons that fan out of a point one after the other, each along its
 * spot of an arc (the Resources tab's sockets, the dice lab's dice). The arrow
 * keys move between them; Escape is left to whoever opened the fan.
 */
export function RadialFan({ buttons, spots, x, y, label, focusFirst = false }: RadialFanProps): React.ReactElement {
  const isPresent = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusFirst && ref.current) fanButtons(ref.current)[0]?.focus({ preventScroll: true });
  }, [focusFirst]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const fan = ref.current;
    if (!fan || (step === undefined && event.key !== 'Home' && event.key !== 'End')) return;
    const all = fanButtons(fan);
    if (all.length === 0) return;
    event.preventDefault();
    const at = all.indexOf(fan.ownerDocument.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : (at + (step ?? 0) + all.length) % all.length;
    all[next]?.focus({ preventScroll: true });
  };

  const motionOf = (index: number): React.ComponentProps<typeof motion.div> => ({
    initial: { opacity: 0, x: 0, y: 0, scale: 0.4 },
    animate: {
      opacity: 1, x: spots[index]!.x, y: spots[index]!.y, scale: 1,
      transition: { duration: ENTER_S, ease: EASE_OUT_CONTROL_POINTS, delay: index * STAGGER_S },
    },
    exit: { opacity: 0, x: 0, y: 0, scale: 0.4, transition: { duration: EXIT_S, ease: EASE_OUT_CONTROL_POINTS } },
  });

  return (
    // A fan on its way out must not be found or clicked: the next one is already open
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn('atlas-csm-fan', !isPresent && 'atlas-leaving')}
      style={{ left: x, top: y }}
      aria-hidden={isPresent ? undefined : true}
      onKeyDown={onKeyDown}
    >
      {buttons.map((button, index) => (
        <motion.div key={index} className="atlas-csm-fan__item" {...motionOf(index)}>
          <LabelTooltip label={button.label} side={spots[index]!.side}>
            <button
              type="button"
              className={cn('atlas-csm-fan__button', (button.pressed || button.expanded) && 'atlas-pressed', button.danger && 'atlas-danger')}
              aria-pressed={button.pressed}
              aria-expanded={button.expanded}
              aria-disabled={button.disabled || undefined}
              onClick={() => { if (!button.disabled) button.onClick(); }}
            >
              {button.icon}
            </button>
          </LabelTooltip>
        </motion.div>
      ))}
    </div>
  );
}
