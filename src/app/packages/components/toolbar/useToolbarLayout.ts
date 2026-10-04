import { useCallback, useMemo } from "react"
import { useAtlasSettings } from "../../../keyboard/useMapHotkeys"
import { resolveToolbarLayout, storedToolbarLayout, type StoredToolbarLayout, type ToolbarLayout } from "../../../toolbar/toolbarLayout"

export interface ToolbarLayoutAccess {
  layout: ToolbarLayout
  stored: StoredToolbarLayout
  /** Stores a changed layout; every open view follows it. A function is applied to the latest stored layout. */
  commit: (next: ToolbarLayout | ((latest: ToolbarLayout) => ToolbarLayout)) => void
  /** Back to the default layout. */
  reset: () => void
  /** Puts a stored layout back as it was (undoing a reset). */
  restore: (stored: StoredToolbarLayout) => void
}

const NO_STORED_LAYOUT: StoredToolbarLayout = {}

/** The GM's toolbar layout, resolved; the default where Atlas' settings cannot be reached (tests). */
export function useToolbarLayout(): ToolbarLayoutAccess {
  const settings = useAtlasSettings()
  const stored = settings?.getToolbarLayout() ?? NO_STORED_LAYOUT
  const layout = useMemo(() => resolveToolbarLayout(stored), [stored])

  // Read the stored layout at write time: two writes before a re-render must not lose the first.
  const commit = useCallback((next: ToolbarLayout | ((latest: ToolbarLayout) => ToolbarLayout)): void => {
    if (!settings) return
    const latest = settings.getToolbarLayout()
    settings.setToolbarLayout(storedToolbarLayout(latest, typeof next === "function" ? next(resolveToolbarLayout(latest)) : next))
  }, [settings])
  const reset = useCallback((): void => settings?.setToolbarLayout({}), [settings])
  const restore = useCallback((previous: StoredToolbarLayout): void => settings?.setToolbarLayout(previous), [settings])

  return { layout, stored, commit, reset, restore }
}
