import { MotionGlobalConfig, useReducedMotion, type Variants } from 'framer-motion'
import {
  EASE_OUT_CONTROL_POINTS as EASE_OUT,
  MOTION_FAST_MS,
  MOTION_SLOW_MS,
  PANEL_ENTER_FROM,
  PANEL_ENTER_MS,
  PANEL_EXIT_MS,
  PANEL_EXIT_TO,
  prefersReducedMotion,
} from '../../../../utils/motion'

// The toolbar editor's motion. Springs are given by how long they look (Motion's
// `visualDuration`) and how far they overshoot; only transform and opacity move,
// besides the real width of slots and the ghost's real size. Cues drawn by CSS
// alone (the press, "More tools" as the landing place, the tray refusing the
// Command palette, the hint coming back) keep their values in the editor's SCSS.

/** Fits both a value animation (`animate`) and a component's `transition`. */
export interface EditorSpring {
  type: 'spring'
  visualDuration: number
  bounce: number
}

export interface EditorFade {
  duration: number
  ease: typeof EASE_OUT
}

function spring(visualDuration: number, bounce = 0): EditorSpring {
  return { type: 'spring', visualDuration, bounce }
}

function fade(ms: number): EditorFade {
  return { duration: ms / 1000, ease: EASE_OUT }
}

/** The ghost lifting off a control, and growing or shrinking between the bar's and the tray's faces. */
export const LIFT = spring(0.2)
/** Slots opening and closing, and neighbours gliding aside. */
export const GAP = spring(0.25)
/** A dropped ghost settling onto its control, and its lift fading. */
export const SETTLE = spring(0.3, 0.1)
export const SETTLE_LIFT = spring(0.3)
/** A cancelled drag going back where it came from. */
export const RETURN = spring(0.3)
/** A tool flying between the bar and the tray (Hide, Show on toolbar, Delete, Enter). */
export const FLIGHT = spring(0.35)
/** A step of the keyboard (Alt with the arrow keys): short, so key repeat retargets it cleanly. */
export const CARRY = spring(0.15)

export const LIFT_SCALE = 1.05
/** A dragged ghost outside both the bar and the tray. */
export const OUTSIDE_OPACITY = 0.85
/** A flying ghost swells a little on its way and is back to its size as it lands. */
export const FLIGHT_SCALE: { keyframes: number[]; transition: EditorFade } = {
  keyframes: [1, 1.04, 1],
  transition: { duration: 0.35, ease: EASE_OUT },
}

/** A slot's content, a well and a ghost's faces fading in or out. */
export const FADE = fade(MOTION_FAST_MS)
/** Controls that a reset brings back or sends away follow each other by this much. */
export const STAGGER_MS = 30
/** A refusal shakes the control: `sin(p · 2π · cycles) · (1 − p) · amplitude`, the locked door's motion. */
export const SHAKE = { durationMs: MOTION_SLOW_MS, cycles: 2, amplitudePx: 4 } as const

/** With reduced motion a flight is a crossfade: out where the tool was, in where it lands. */
export const REDUCED_FADE_OUT = fade(MOTION_FAST_MS)
export const REDUCED_FADE_IN = fade(150)
/** With reduced motion a refusal tints the control instead of shaking it. */
export const REFUSAL_TINT_MS = MOTION_SLOW_MS

/** The card over a tool: hover this long before it opens; within the skip window after one closes, the next opens at once. */
export const CARD_OPEN_DELAY_MS = 500
export const CARD_SKIP_MS = 400
/** The card gliding from one tool to the next. */
export const CARD_GLIDE = spring(0.18)
/** The card rising into place as it opens, and shrinking a little as it fades out. */
export const CARD_ENTER = fade(150)
export const CARD_ENTER_FROM = { y: 4, scale: 0.97 } as const
export const CARD_EXIT = fade(MOTION_FAST_MS)
export const CARD_EXIT_SCALE = 0.98

/** The tray waits a moment, so the palette that started edit mode is mostly gone before it rises. */
const TRAY_ENTER_DELAY = 0.08

const trayVariants = {
  hidden: { opacity: 0, transform: PANEL_ENTER_FROM },
  visible: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: { ...fade(PANEL_ENTER_MS), delay: TRAY_ENTER_DELAY } },
  exit: { opacity: 0, transform: PANEL_EXIT_TO, transition: fade(PANEL_EXIT_MS) },
} satisfies Variants

const fadingTrayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: trayVariants.visible.transition },
  exit: { opacity: 0, transition: trayVariants.exit.transition },
} satisfies Variants

/** The tray rises out of the bar like a panel; with reduced motion it only fades. */
export function useTrayVariants(): Variants {
  return useReducedMotion() ? fadingTrayVariants : trayVariants
}

/** How the editor moves right now: not at all (Motion's animations are skipped), reduced, or fully. */
export type EditorMotionMode = 'skip' | 'reduced' | 'full'

/** Whether animations run, asked of the window `node` lives in (main or popout). */
export function motionModeOf(node: Node | null): EditorMotionMode {
  if (MotionGlobalConfig.skipAnimations || !node) return 'skip'
  return prefersReducedMotion(node) ? 'reduced' : 'full'
}
