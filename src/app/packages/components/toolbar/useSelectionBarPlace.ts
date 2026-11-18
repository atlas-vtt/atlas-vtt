import { useLayoutEffect, useState } from "react"
import type React from "react"
import type { Viewport } from "pixi-viewport"
import { BOTTOM_BARS, TOP_BARS } from "../../../pixi/lighting/useLightPopoverPosition"
import { useViewStoreHook } from "../../../react/ViewStoreContext"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { MOTION_EASE_OUT, MOTION_NORMAL_MS, prefersReducedMotion } from "../../../utils/motion"
import { observeResize } from "../../../utils/observeResize"
import type { BarSide } from "./barSide"
import { placeSelectionBar, type BarPlaceInput, type BarPlaceSide, type Point, type Rect } from "./selectionBarPlacement"

/** The panels at the map's sides a bar may be asked to keep beside. */
const SIDE_PANELS = ".atlas-level-switcher, .atlas-initiative-tracker"

/** Where the map's canvas lies in the bar's area (`x`, `y`), the area's size and what its bars and side panels cover. */
type Room = Point & Pick<BarPlaceInput, "area" | "inset" | "sides">

/** What a selection shows on the canvas, in the canvas' pixels; null while it shows nothing. */
export type ShownOnCanvas = (viewport: Viewport) => Point[] | null

export interface BarPlaceOptions {
  /** The side the bar takes where it has the room; below unless said. */
  readonly prefer?: BarPlaceSide
  /** The bar keeps clear of another bar of the selection that stands in the same area, and beside the panels at the map's sides. */
  readonly yields?: boolean
  /** The width of the bar's part that is centred on the selection; the whole bar unless said. */
  readonly centred?: (bar: HTMLElement) => number
}

const NO_OPTIONS: BarPlaceOptions = {}

/** Where the bars of a selection stand in each map area, so that one can keep clear of the other. */
const standing = new WeakMap<Element, Map<HTMLElement, Rect>>()

/**
 * Keeps the bar in `ref` beside what its selection shows (`placeSelectionBar`), on the map's own
 * frame clock, so it follows a pan, a zoom and a selection that was dragged, resized or turned in
 * the frame the canvas shows them. It is placed with `translate`, written only when its place
 * changes, and its `transform-origin` is the middle of its edge that faces the selection, which it
 * grows out of. Where another selection takes it, it glides there. While the selection shows
 * nothing (the bar leaving) it stays where it was. The side its menus open to is returned: away
 * from the selection.
 */
export function useSelectionBarPlace(ref: React.RefObject<HTMLElement | null>, shown: ShownOnCanvas, options: BarPlaceOptions = NO_OPTIONS): BarSide {
  const store = useViewStoreHook()
  const { renderer, pixiApp } = useAtlasUI()
  const prefer = options.prefer ?? "below"
  const [side, setSide] = useState<BarPlaceSide>(prefer)

  useLayoutEffect(() => {
    const element = ref.current
    const container = element?.offsetParent
    const viewport = renderer?.getViewportInstance()
    const canvas = renderer?.getCanvasElement()
    if (!element || !container || !viewport || !canvas) return undefined
    const bars = [...container.querySelectorAll(`${TOP_BARS}, ${BOTTOM_BARS}`)]
    let current: BarPlaceSide | null = null
    let placedFor = ""
    let placed: Point | null = null
    let selection = store.getState().selectedIds
    let glide: Animation | null = null
    const others = standing.get(container) ?? new Map<HTMLElement, Rect>()
    standing.set(container, others)

    const measure = (): Room => {
      const area = container.getBoundingClientRect()
      const map = canvas.getBoundingClientRect()
      const rects = (selector: string): DOMRect[] => [...container.querySelectorAll(selector)].map((bar) => bar.getBoundingClientRect()).filter((rect) => rect.height > 0)
      return {
        x: map.left - area.left,
        y: map.top - area.top,
        area: { width: area.width, height: area.height },
        inset: {
          top: Math.max(0, ...rects(TOP_BARS).map((rect) => rect.bottom - area.top)),
          bottom: Math.max(0, ...rects(BOTTOM_BARS).map((rect) => area.bottom - rect.top)),
        },
        sides: options.yields
          ? rects(SIDE_PANELS).map((rect) => ({ left: rect.left - area.left, top: rect.top - area.top, right: rect.right - area.left, bottom: rect.bottom - area.top }))
          : [],
      }
    }
    let room = measure()

    const update = (): void => {
      const onCanvas = shown(viewport)
      if (!onCanvas) return
      const points = onCanvas.map(({ x, y }) => ({ x: room.x + x, y: room.y + y }))
      if (options.yields) {
        // The other bar of the selection stands nearer to it: this one keeps clear of both.
        for (const [bar, rect] of others) {
          if (bar !== element) points.push({ x: rect.left, y: rect.top }, { x: rect.right, y: rect.bottom })
        }
      }
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      const centred = options.centred?.(element) ?? size.width
      const key = `${points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} ${size.width}x${size.height} ${centred}`
      if (key === placedFor) return
      placedFor = key
      // Another selection: the panels beside the map are measured again, and the bar glides from where it stood to its new place.
      const now = store.getState().selectedIds
      const moved = now !== selection
      selection = now
      if (moved && options.yields) room = measure()
      const place = placeSelectionBar({ shown: points, size, area: room.area, inset: room.inset, sides: room.sides, current, prefer, centred })
      if (place.side !== current) {
        current = place.side
        setSide(place.side)
      }
      const travels = placed !== null && moved && !prefersReducedMotion(element)
      const from = placed
      placed = { x: place.x, y: place.y }
      others.set(element, { left: place.x, top: place.y, right: place.x + size.width, bottom: place.y + size.height })
      element.style.translate = `${place.x}px ${place.y}px`
      element.style.transformOrigin = `${place.origin.x}px ${place.origin.y}px`
      if (travels && from && (from.x !== place.x || from.y !== place.y)) {
        glide?.cancel()
        glide = element.animate([{ translate: `${from.x}px ${from.y}px` }, { translate: `${place.x}px ${place.y}px` }], { duration: MOTION_NORMAL_MS, easing: MOTION_EASE_OUT })
      }
    }
    const remeasure = (): void => {
      room = measure()
      placedFor = ""
      update()
    }

    update()
    const ticker = pixiApp?.ticker
    ticker?.add(update)
    const stopObserving = observeResize([element, container, ...bars], remeasure)
    return () => {
      // A view that closes destroys its PIXI app, and with it this ticker, before the UI unmounts.
      if (ticker && pixiApp?.ticker === ticker) ticker.remove(update)
      stopObserving()
      glide?.cancel()
      others.delete(element)
    }
  }, [ref, renderer, pixiApp, store, shown, options, prefer])

  return side === "below" ? "bottom" : "top"
}
