import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../packages/components/primitives/button';
import { EASE_OUT_CONTROL_POINTS, MOTION_NORMAL_MS } from '../../../utils/motion';
import { t } from '../../../i18n';

/** How long the toast stays (§7.8). */
export const UNDO_TOAST_MS = 5000;

export interface UndoToastProps {
  /** "Speed deleted". */
  text: string;
  onUndo: () => void;
  /** Its time is up, or it was answered. */
  onDismiss: () => void;
}

/**
 * The toast after a delete (§7.8): what went, with Undo, for five seconds.
 * The pointer resting on it holds it open. It rises in on the compositor
 * (transform and opacity), or only fades where motion is reduced.
 */
export function UndoToast({ text, onUndo, onDismiss }: UndoToastProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() === true;
  const held = useRef(false);

  useEffect(() => {
    const win = ref.current?.win;
    if (!win) return undefined;
    const timer = win.setInterval(() => {
      if (!held.current) onDismiss();
    }, UNDO_TOAST_MS);
    return () => win.clearInterval(timer);
  }, [text, onDismiss]);

  const offset = reduced ? {} : { transform: 'translateY(8px)' };
  return (
    <motion.div
      ref={ref}
      className="atlas-te-toast"
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={{ opacity: 0, ...offset }}
      transition={{ duration: MOTION_NORMAL_MS / 1000, ease: EASE_OUT_CONTROL_POINTS }}
      onPointerEnter={() => { held.current = true; }}
      onPointerLeave={() => { held.current = false; }}
    >
      <span className="atlas-te-toast__text">{text}</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => { onUndo(); onDismiss(); }}>{t('templateEditor.undo')}</Button>
    </motion.div>
  );
}
