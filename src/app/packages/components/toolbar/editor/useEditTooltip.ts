import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMotionValue } from 'framer-motion'
import { isToolbarControlId, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { workSlices } from '../../../../utils/workSlices'
import { TOOLBAR_SCREENSHOTS } from '../toolbarScreenshots'
import { appearCard, cardFits, vanishCard, type CardEntrance, type EditCardMotion } from './editCardMotion'
import { CARD_OPEN_DELAY_MS, CARD_SKIP_MS } from './editorMotion'
import { editorRowOf, isHtmlElement } from './toolbarEditDom'
import { useToolbarEditStore, type ToolbarEditState } from './toolbarEditStore'

/** The tool the card is about, from the moment it was asked to show. */
export interface EditCardContent {
  id: ToolbarControlId
  anchor: HTMLElement
  entrance: CardEntrance
  serial: number
}

export interface EditTooltip {
  content: EditCardContent | null
  /** The screenshot to show; null without one, or where the room above the tray is too low for it. */
  image: string | null
  motion: EditCardMotion
}

type CardSource = 'pointer' | 'focus'

/** Not `instanceof`: an element of a popout window is none of this window's classes. */
function handleFrom(target: EventTarget | null): HTMLElement | null {
  const element = target as Partial<Element> | null
  if (typeof element?.closest !== 'function') return null
  return (element as Element).closest<HTMLElement>('.atlas-toolbar-handle')
}

function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible')
  } catch {
    return false
  }
}

function isBusy(state: ToolbarEditState): boolean {
  return state.pressed !== null || state.drag !== null || state.settle !== null || state.ghost !== null
}

/** Decodes the screenshots ahead, one at a time between the browser's turns, so the first card is never blank. */
function useScreenshotPreload(): void {
  useEffect(() => {
    let cancelled = false
    const held: HTMLImageElement[] = []
    const preload = async (): Promise<void> => {
      const pace = workSlices()
      for (const src of Object.values(TOOLBAR_SCREENSHOTS)) {
        if (cancelled) return
        if (src === null) continue
        const image = createEl('img', { attr: { src, decoding: 'async' } })
        held.push(image)
        await image.decode().catch(() => undefined)
        await pace()
      }
    }
    void preload()
    return () => {
      cancelled = true
      held.length = 0
    }
  }, [])
}

/**
 * The toolbar editor's card over the tool under the pointer or focused from
 * the keyboard. It opens after `CARD_OPEN_DELAY_MS` of hover, at once for
 * keyboard focus and, within `CARD_SKIP_MS` after a card closed, for a
 * neighbour, to which it glides. A press, a key, the wheel, a context menu,
 * the window losing focus or a drag hides it at once; it never takes a key
 * (Escape passes on). The tool it was hidden on shows no card until the
 * pointer has left it. Touch gets none.
 */
export function useEditTooltip(cardRef: React.RefObject<HTMLElement | null>, active: boolean): EditTooltip {
  const editStore = useToolbarEditStore()
  const [content, setContent] = useState<EditCardContent | null>(null)
  // The content whose image did not fit above the tray.
  const [textOnly, setTextOnly] = useState<number | null>(null)
  const serial = useRef(0)
  // The content shown now (null once the card hid), and the last one placed.
  const live = useRef<number | null>(null)
  const placed = useRef<number | null>(null)
  const motion: EditCardMotion = {
    x: useMotionValue(0),
    y: useMotionValue(0),
    scale: useMotionValue(1),
    opacity: useMotionValue(0),
    originX: useMotionValue('50%'),
  }
  const { x, y, scale, opacity, originX } = motion
  useScreenshotPreload()

  useEffect(() => {
    const card = cardRef.current
    const row = editorRowOf(card) ?? undefined
    if (!active || !card || !isHtmlElement(row)) return undefined
    const cardMotion = { x, y, scale, opacity, originX }
    const win = row.win
    const doc = row.doc
    let pointerOver: HTMLElement | null = null
    let dismissed: string | null = null
    let shown: { id: string; by: CardSource } | null = null
    let closedAt = -Infinity
    let timer: number | undefined
    const busy = (): boolean => isBusy(editStore.state.getState())
    const stopTimer = (): void => {
      win.clearTimeout(timer)
      timer = undefined
    }

    const show = (anchor: HTMLElement, by: CardSource): void => {
      const id = anchor.dataset.control ?? ''
      stopTimer()
      if (!isToolbarControlId(id) || busy()) return
      if (shown?.id === id) {
        shown = { id, by }
        return
      }
      const entrance: CardEntrance = shown || performance.now() - closedAt < CARD_SKIP_MS ? 'instant' : 'enter'
      shown = { id, by }
      serial.current += 1
      live.current = serial.current
      setContent({ id, anchor, entrance, serial: serial.current })
    }
    const close = (how: 'hard' | 'soft'): void => {
      stopTimer()
      if (!shown) return
      shown = null
      live.current = null
      closedAt = performance.now()
      vanishCard(cardMotion, card, how)
    }
    // Hidden at once; the tool under the pointer stays without a card until the pointer leaves it.
    const dismiss = (event: Event): void => {
      // A press tells where the pointer is, also after a drag that held it.
      if (event.type === 'pointerdown') pointerOver = handleFrom(event.target)
      dismissed = pointerOver?.dataset.control ?? null
      close('hard')
    }
    const pointAt = (handle: HTMLElement | null): void => {
      if (handle === pointerOver) return
      pointerOver = handle
      const id = handle?.dataset.control ?? null
      if (id !== dismissed) dismissed = null
      stopTimer()
      if (!handle) {
        if (shown?.by === 'pointer') close('soft')
        return
      }
      if (id === dismissed) return
      if (shown || performance.now() - closedAt < CARD_SKIP_MS) show(handle, 'pointer')
      else timer = win.setTimeout(() => show(handle, 'pointer'), CARD_OPEN_DELAY_MS)
    }

    // A drag holds the pointer: the tools it passes, and the one it lands on, get no card.
    const onPointerOver = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch' && !busy()) pointAt(handleFrom(event.target))
    }
    const onPointerOut = (event: PointerEvent): void => {
      const next = event.relatedTarget as Node | null
      if (event.pointerType !== 'touch' && !busy() && !row.contains(next)) pointAt(null)
    }
    // Listening starts after the editor's first layout, so the focus it moves to the bar on entry opens no card.
    const onFocusIn = (event: FocusEvent): void => {
      const handle = handleFrom(event.target)
      if (handle && isFocusVisible(handle)) show(handle, 'focus')
      else if (shown?.by === 'focus') close('soft')
    }
    const onFocusOut = (event: FocusEvent): void => {
      if (!handleFrom(event.relatedTarget) && shown?.by === 'focus') close('soft')
    }
    const unsubscribe = editStore.state.subscribe((state) => {
      if (isBusy(state)) close('hard')
    })
    row.addEventListener('pointerover', onPointerOver)
    row.addEventListener('pointerout', onPointerOut)
    row.addEventListener('focusin', onFocusIn)
    row.addEventListener('focusout', onFocusOut)
    for (const type of ['pointerdown', 'keydown', 'contextmenu'] as const) doc.addEventListener(type, dismiss, true)
    doc.addEventListener('wheel', dismiss, { capture: true, passive: true })
    win.addEventListener('blur', dismiss)
    return () => {
      close('hard')
      unsubscribe()
      row.removeEventListener('pointerover', onPointerOver)
      row.removeEventListener('pointerout', onPointerOut)
      row.removeEventListener('focusin', onFocusIn)
      row.removeEventListener('focusout', onFocusOut)
      for (const type of ['pointerdown', 'keydown', 'contextmenu'] as const) doc.removeEventListener(type, dismiss, true)
      doc.removeEventListener('wheel', dismiss, { capture: true })
      win.removeEventListener('blur', dismiss)
    }
  }, [active, cardRef, editStore, x, y, scale, opacity, originX])

  const screenshot = content ? TOOLBAR_SCREENSHOTS[content.id] : null
  const image = content && textOnly !== content.serial ? screenshot : null

  // Placed once its content is laid out: first with the screenshot, without it where that does not fit.
  useLayoutEffect(() => {
    const card = cardRef.current
    const parent = card?.parentElement
    if (!content || !card || !parent || live.current !== content.serial || placed.current === content.serial) return
    if (image !== null && !cardFits(card, parent)) {
      setTextOnly(content.serial)
      return
    }
    placed.current = content.serial
    appearCard({ x, y, scale, opacity, originX }, card, parent, content.anchor, content.entrance)
  }, [content, image, cardRef, x, y, scale, opacity, originX])

  return { content, image, motion }
}
