import React, { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useIsPresent } from "framer-motion"
import { Check, Ellipsis, Plus } from "lucide-react"
import { setIcon } from "obsidian"
import { t } from "../../../i18n"
import type { ScreenBox, SelectionBarSource } from "../../../pixi/selection/selectionBarSource"
import { useCoarsePointer } from "../../../platform/useCoarsePointer"
import type { ContextMenuEntry } from "../../../react/components/context-menu/AtlasContextMenu"
import { useAtlasStore, useViewStoreHook } from "../../../react/ViewStoreContext"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { useContextMenu } from "../../../react/root/ContextMenuContext"
import { choicesOf, primaryActions, type ChoicesAction, type RunAction } from "../../../selection/selectionActions"
import { selectionMenu } from "../../../selection/selectionMenu"
import { useAnchoredPopoverVariants } from "../primitives/dialogMotion"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { GroupBreak, TOOL_BAR_CHOICE_CLASS } from "./ToolOptionsBar"
import type { Point } from "./selectionBarPlacement"
import { useSelectionActionsShown } from "./useSelectionActionsShown"
import { useSelectionBarPlace, type BarPlaceOptions } from "./useSelectionBarPlace"

/** The class of the bar above a selection. */
const SELECTION_ACTIONS_BAR = "atlas-selection-actions"
/** The bar's last part, which Select more adds: it hangs to the right, so the buttons before it stay under the finger. */
const TAIL = "atlas-selection-actions__tail"

/** Above the selection, clear of the bar under drawings and texts and of the panels at the map's sides, centred without its tail. */
const PLACE: BarPlaceOptions = {
  prefer: "above",
  yields: true,
  centred: (bar) => {
    const tail = bar.querySelector<HTMLElement>(`.${TAIL}`)
    return tail ? 2 * tail.offsetLeft + tail.offsetWidth - bar.offsetWidth : bar.offsetWidth
  },
}

type Glyph = React.ComponentType<{ className?: string }>
const glyphs = new Map<string, Glyph>()

/** An Obsidian icon as a button's icon, the same component for the same icon. */
function glyphOf(name: string): Glyph {
  let glyph = glyphs.get(name)
  if (!glyph) {
    glyph = function ActionGlyph(): React.ReactElement {
      const ref = useRef<HTMLSpanElement>(null)
      useEffect(() => {
        if (!ref.current) return
        ref.current.replaceChildren()
        setIcon(ref.current, name)
      }, [])
      return <span ref={ref} className="atlas-selection-actions__glyph" />
    }
    glyphs.set(name, glyph)
  }
  return glyph
}

/**
 * The bar above what is selected on the map: Select more, the selection's own actions as buttons
 * (`primaryActions`), More with everything else, and Done while Select more is on. It is drawn
 * from the list the context menu is drawn from (`selectionActions`), so the two offer the same.
 * Under a finger it always shows and its buttons say what they do in a word; under a mouse it is
 * the device's choice (Settings, Maps).
 */
export function SelectionActionsBarHost(): React.ReactElement {
  const { renderer } = useAtlasUI()
  const source = useCallback(() => renderer?.getSelectionBar() ?? null, [renderer])
  const [ownMenu, setOwnMenu] = useState(false)
  const shown = useSelectionActionsShown(source, ownMenu)
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{shown && <SelectionActionsBar key="selection-actions" source={source} onMenu={setOwnMenu} />}</AnimatePresence>
    </TooltipProvider>
  )
}

interface BarProps {
  source: () => SelectionBarSource | null
  /** Told while a menu the bar opened stands open. */
  onMenu: (open: boolean) => void
}

function SelectionActionsBar({ source, onMenu }: BarProps): React.ReactElement {
  const store = useViewStoreHook()
  const menu = useContextMenu()
  const coarse = useCoarsePointer()
  const selectMore = useAtlasStore((state) => state.selectMore)
  // What is offered follows what is selected and what the scene holds of it; a bar that is leaving follows nothing.
  const present = useIsPresent()
  useAtlasStore((state) => (present ? state.selectedIds : null))
  useAtlasStore((state) => (present ? state.objects : null))
  const ref = useRef<HTMLDivElement>(null)
  const box = useRef<ScreenBox>({ left: 0, top: 0, right: 0, bottom: 0 })
  const shown = useCallback((): Point[] | null => {
    const at = box.current
    return source()?.shown(at) ? [{ x: at.left, y: at.top }, { x: at.right, y: at.bottom }] : null
  }, [source])
  const side = useSelectionBarPlace(ref, shown, PLACE)
  const variants = useAnchoredPopoverVariants()
  const [open, setOpen] = useState<string | null>(null)

  // While it leaves, nothing may be selected any more: the bar keeps the buttons it had.
  const kept = useRef<(RunAction | ChoicesAction)[]>([])
  const primaries = present ? primaryActions(source()?.actions({ x: 0, y: 0 }) ?? []) : []
  if (primaries.length > 0) kept.current = primaries

  /** Opens a menu at the bar's far corner, beside the selection; `read` gives its rows again whenever `follow` reports a change. */
  const openMenu = (id: string, label: string, read: (at: Point) => ContextMenuEntry[], follow?: ChoicesAction["follow"]): void => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const at = { x: rect.right, y: rect.top }
    let refreshing = false
    let stop = (): void => undefined
    const show = (): void => menu.open(read(at), at, {
      label,
      onClose: () => {
        // Its rows drawn anew are the same menu
        if (refreshing) return
        stop()
        setOpen(null)
        onMenu(false)
      },
    })
    stop = follow?.(() => {
      refreshing = true
      show()
      refreshing = false
    }) ?? stop
    show()
    setOpen(id)
    onMenu(true)
  }
  const caption = (word: string): { caption: string } | Record<string, never> => (coarse ? { caption: word } : {})

  return (
    <motion.div
      ref={ref}
      role="toolbar"
      aria-label={t("selection.bar")}
      className={`atlas-tool-bar ${SELECTION_ACTIONS_BAR}`}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <ToolButton icon={Plus} label={t("selection.selectMore")} {...caption(t("selection.add"))} isActive={selectMore} pressed={selectMore}
        onClick={() => store.getState().setSelectMore(!selectMore)} className={TOOL_BAR_CHOICE_CLASS} tooltipSide={side} />
      <GroupBreak />
      {kept.current.map((action) => (
        <ToolButton
          key={action.id}
          icon={glyphOf(action.icon ?? "")}
          label={action.label}
          {...caption(action.primary?.label ?? action.label)}
          isActive={false}
          disabled={!action.enabled}
          tooltipSide={side}
          {...(action.destructive && { className: "atlas-selection-actions__destructive" })}
          {...(action.kind === "choices"
            ? { menuExpanded: open === action.id, onClick: () => openMenu(action.id, action.label, () => choicesOf(action), action.follow) }
            : { onClick: () => void action.run() })}
        />
      ))}
      <ToolButton icon={Ellipsis} label={t("selection.more")} {...caption(t("selection.more"))} isActive={false} menuExpanded={open === "more"} tooltipSide={side}
        onClick={() => openMenu("more", t("selection.bar"), (at) => selectionMenu(source()?.actions(at) ?? [], menu.close))} />
      {selectMore && (
        <div className={TAIL}>
          <ToolButton icon={Check} label={t("common.done")} {...caption(t("common.done"))} isActive={false} tooltipSide={side}
            onClick={() => store.getState().setSelectMore(false)} />
        </div>
      )}
    </motion.div>
  )
}
