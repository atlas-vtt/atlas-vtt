import { createContext, useContext } from "react"

/**
 * Which way a bar's menus and tooltips open: away from what the bar stands beside. The bars above
 * the main toolbar open theirs upward (`top`); the bar under a selection on the map opens them
 * downward, away from what it changes (`bottom`), or upward where it stands above it.
 */
export type BarSide = "top" | "bottom"

const BarSideContext = createContext<BarSide>("top")

export const BarSideProvider = BarSideContext.Provider

export function useBarSide(): BarSide {
  return useContext(BarSideContext)
}
