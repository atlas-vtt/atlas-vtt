import React, { useDeferredValue, useLayoutEffect, useMemo, useRef, type Ref } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DIALOG_EXIT_DURATION, dialogOverlayMotion, useDialogWindowVariants } from '../../primitives/dialogMotion';
import { holdShownStyle, passThroughOnExit } from './windowMotion';

const wrapperVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: DIALOG_EXIT_DURATION, when: 'afterChildren' as const } },
};

interface AssetManagerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  onExitComplete?: (() => void) | undefined;
  overlayRef: Ref<HTMLDivElement>;
  children: React.ReactNode;
}

/**
 * Whether the asset manager is open, for everything that renders and loads it: it opens in a render of its own, which
 * React does in slices between frames, so the press that opened it paints at once and the open drops no frames (one
 * task of 50 ms before, and the hooks of the whole manager ran in the press's own task until it was deferred here
 * rather than in the window). It closes at once.
 */
export function useOpenedAfterPress(isOpen: boolean): boolean {
  const opening = useDeferredValue(isOpen);
  return isOpen && opening;
}

/** The asset manager's overlay, backdrop and window, and how they open and close. `isOpen` from `useOpenedAfterPress`. */
export function AssetManagerWindow({ isOpen, onClose, onExitComplete, overlayRef, children }: AssetManagerWindowProps): React.JSX.Element {
  // A closing window lets the pointer through at once: a token handed to the map is placed while it fades.
  const dialogWindowVariants = useDialogWindowVariants();
  const windowVariants = useMemo(() => passThroughOnExit(dialogWindowVariants), [dialogWindowVariants]);
  const windowRef = useRef<HTMLDivElement>(null);
  const holdWindowStyle = useMemo(() => holdShownStyle(() => windowRef.current, windowVariants, 'visible'), [windowVariants]);
  // After Motion's own render, which a commit of the window queues as a microtask from its layout effect.
  useLayoutEffect(() => { queueMicrotask(holdWindowStyle.reapply); });

  return (
    // Stays mounted while closed so the window can animate out.
    <AnimatePresence {...(onExitComplete ? { onExitComplete } : {})}>
      {isOpen && (
        <motion.div
          key="asset-manager-modal"
          className="atlas-vtt-plugin atlas-vtt-root atlas-asset-manager-modal"
          ref={overlayRef}
          tabIndex={-1}
          variants={wrapperVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="atlas-asset-manager-backdrop"
            onClick={onClose}
            variants={dialogOverlayMotion.variants}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          {/* The window moves as one piece. The container inside clips its content to the
              window's corners; what is drawn around the window (a theme's ornament) hangs
              from this element and so moves and fades with it. */}
          <motion.div
            ref={windowRef}
            className="atlas-asset-manager-window"
            variants={windowVariants}
            onAnimationStart={holdWindowStyle.onAnimationStart}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
