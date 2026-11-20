import { useLayoutEffect, useState } from "react"
import type React from "react"
import { frameCorners, framePoint, type Frame } from "../../../annotations/annotationFrame"
import { HANDLE_LOOK } from "../../../annotations/annotationHandles"
import { BOTTOM_BARS, TOP_BARS } from "../../../pixi/lighting/useLightPopoverPosition"
import { useViewStoreHook } from "../../../react/ViewStoreContext"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { MOTION_EASE_OUT, MOTION_NORMAL_MS, prefersReducedMotion } from "../../../utils/motion"
import { observeResize } from "../../../utils/observeResize"
import type { BarSide } from "./barSide"
import { placeSelectionBar, type BarPlaceInput, type BarPlaceSide, type Point } from "./selectionBarPlacement"

/** From the frame's line to the outer edge of its corner handles, screen pixels. */
const HANDLE_REACH = HANDLE_LOOK.gap + HANDLE_LOOK.grip
/** From the frame's line to the far edge of its turn handle, screen pixels. */
const TURN_REACH = HANDLE_LOOK.gap + HANDLE_LOOK.stem + HANDLE_LOOK.turnRadius

/** Where the map's canvas lies in the bar's area (`x`, `y`), the area's size and what its bars cover. */
type Room = Point & Pick<BarPlaceInput, "area" | "inset">

/** What the frame shows on screen at `zoom`, as `toScreen` places world points: its corners with their handles, and its turn handle. */
function shownOnScreen(frame: Frame, zoom: number, toScreen: (point: Point) => Point): Point[] {
  return [...frameCorners(frame, HANDLE_REACH / zoom), framePoint(frame, { x: 0, y: -1 }, TURN_REACH / zoom)].map(toScreen)
}

/**
 * Keeps the bar in `ref` under the selection's frame (`placeSelectionBar`), on the map's own frame
 * clock, so it follows a pan, a zoom and a selection that was dragged, resized or turned in the
 * frame the canvas shows them. It is placed with `translate`, and its `transform-origin` is the
 * middle of its edge that faces the selection, which it grows out of. Where another selection
 * takes it, it glides there. While the frame is gone (the bar leaving) it stays where it was. The
 * side its menus open to is returned: away from the selection.
 */
export function useSelectionBarPlace(ref: React.RefObject<HTMLElement | null>, frame: () => Frame | null): BarSide {
  const store = useViewStoreHook()
  const { renderer, pixiApp } = useAtlasUI()
  const [side, setSide] = useState<BarPlaceSide>("below")

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

    const measure = (): Room => {
      const area = container.getBoundingClientRect()
      const map = canvas.getBoundingClientRect()
      const edges = (selector: string): DOMRect[] => [...container.querySelectorAll(selector)].map((bar) => bar.getBoundingClientRect()).filter((rect) => rect.height > 0)
      return {
        x: map.left - area.left,
        y: map.top - area.top,
        area: { width: area.width, height: area.height },
        inset: {
          top: Math.max(0, ...edges(TOP_BARS).map((rect) => rect.bottom - area.top)),
          bottom: Math.max(0, ...edges(BOTTOM_BARS).map((rect) => area.bottom - rect.top)),
        },
      }
    }
    let room = measure()

    const update = (): void => {
      const shown = frame()
      if (!shown) return
      const zoom = Math.abs(viewport.scale.x) || 1
      const points = shownOnScreen(shown, zoom, (point) => {
        const at = viewport.toScreen(point.x, point.y)
        return { x: room.x + at.x, y: room.y + at.y }
      })
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      const key = `${points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} ${size.width}x${size.height}`
      if (key === placedFor) return
      placedFor = key
      const place = placeSelectionBar({ shown: points, size, area: room.area, inset: room.inset, current })
      if (place.side !== current) {
        current = place.side
        setSide(place.side)
      }
      // Another selection: the bar glides from where it stood to its new place.
      const now = store.getState().selectedIds
      const travels = placed !== null && now !== selection && !prefersReducedMotion(element)
      selection = now
      const from = placed
      placed = { x: place.x, y: place.y }
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
    }
  }, [ref, renderer, pixiApp, store, frame])

  return side === "below" ? "bottom" : "top"
}
