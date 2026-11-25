import type { Variants } from 'framer-motion';
import { dialogOverlayMotion, dialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import { EASE_OUT_CONTROL_POINTS as EASE_OUT } from '../../utils/motion';

/**
 * The overlay does not fade in: the window is its child and would stay see-through over the workspace. Its dark and
 * its blur come up by themselves (`welcome.scss`); it fades out as other dialogs do.
 */
export const welcomeOverlayMotion = {
  ...dialogOverlayMotion,
  variants: {
    ...dialogOverlayMotion.variants,
    hidden: { opacity: 1 },
    visible: { opacity: 1 },
  },
} as const;

/**
 * The window comes up out of a blur and settles on a soft spring. The blur goes once it is sharp: a filter left on
 * the window would make it the backdrop of every glass surface inside.
 */
export const welcomeWindowVariants = {
  hidden: { opacity: 0, transform: 'translateY(28px) scale(0.94)', filter: 'blur(12px)' },
  visible: {
    opacity: 1,
    transform: 'translateY(0px) scale(1)',
    filter: 'blur(0px)',
    transition: {
      opacity: { duration: 0.45, ease: EASE_OUT },
      filter: { duration: 0.75, ease: EASE_OUT },
      transform: { type: 'spring', visualDuration: 0.9, bounce: 0.16 },
    },
    transitionEnd: { filter: 'none' },
  },
  exit: dialogWindowVariants.exit,
} satisfies Variants;
