import { animate, type MotionValue } from 'framer-motion'
import { viewFrame } from '../../primitives/useKeepInView'
import {
  CARD_ENTER, CARD_ENTER_FROM, CARD_EXIT, CARD_EXIT_SCALE, CARD_GLIDE, FADE, motionModeOf,
} from './editorMotion'

/** The card stays this far inside its view, and needs this much room above the tray to show its screenshot. */
export const CARD_VIEW_MARGIN = 8

/** What moves the toolbar editor's card; `originX` is where its anchor's centre lies inside it. */
export interface EditCardMotion {
  x: MotionValue<number>
  y: MotionValue<number>
  scale: MotionValue<number>
  opacity: MotionValue<number>
  originX: MotionValue<string>
}

/** How the card comes in: with its enter motion, or at once and gliding (a neighbour within the skip window). */
export type CardEntrance = 'enter' | 'instant'

interface CardPlace {
  /** Offset from the left edge of the card's positioned parent. */
  x: number
  origin: number
}

/** Centred over `anchor`, kept `CARD_VIEW_MARGIN` inside the view; left-aligned in a view narrower than the card. */
function cardPlace(card: HTMLElement, parent: Element, anchor: Element): CardPlace {
  const frame = viewFrame(card)
  const width = card.offsetWidth
  const anchorRect = anchor.getBoundingClientRect()
  const centre = anchorRect.left + anchorRect.width / 2
  const left = Math.max(frame.left + CARD_VIEW_MARGIN, Math.min(centre - width / 2, frame.right - CARD_VIEW_MARGIN - width))
  return { x: left - parent.getBoundingClientRect().left, origin: centre - left }
}

/** Whether the card, laid out with its screenshot, fits between the top of its parent (the tray's row) and the top of the view. */
export function cardFits(card: HTMLElement, parent: Element): boolean {
  return parent.getBoundingClientRect().top - viewFrame(card).top >= card.offsetHeight + CARD_VIEW_MARGIN
}

/** Places the card over `anchor` and shows it. Reduced motion only fades it in, quicker, and never glides. */
export function appearCard(motion: EditCardMotion, card: HTMLElement, parent: Element, anchor: Element, entrance: CardEntrance): void {
  const place = cardPlace(card, parent, anchor)
  const mode = motionModeOf(card)
  const moves = mode === 'full'
  motion.originX.set(`${place.origin}px`)
  if (entrance === 'instant' && moves) animate(motion.x, place.x, CARD_GLIDE)
  else motion.x.jump(place.x)
  if (entrance === 'instant' || mode === 'skip') {
    motion.y.jump(0)
    motion.scale.jump(1)
    motion.opacity.jump(1)
    return
  }
  motion.y.jump(moves ? CARD_ENTER_FROM.y : 0)
  motion.scale.jump(moves ? CARD_ENTER_FROM.scale : 1)
  motion.opacity.jump(0)
  animate(motion.y, 0, CARD_ENTER)
  animate(motion.scale, 1, CARD_ENTER)
  animate(motion.opacity, 1, moves ? CARD_ENTER : FADE)
}

/**
 * Hides the card: at once ('hard': a press, a key, the wheel, a drag), or
 * fading as the pointer or focus leaves its tool ('soft').
 */
export function vanishCard(motion: EditCardMotion, card: HTMLElement, how: 'hard' | 'soft'): void {
  const mode = motionModeOf(card)
  if (how === 'hard' || mode === 'skip') {
    motion.opacity.jump(0)
    return
  }
  animate(motion.opacity, 0, CARD_EXIT)
  if (mode === 'full') animate(motion.scale, CARD_EXIT_SCALE, CARD_EXIT)
}
