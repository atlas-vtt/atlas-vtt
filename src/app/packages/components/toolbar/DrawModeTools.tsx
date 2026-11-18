import React from "react"
import { Blend, BringToFront, Eye, EyeOff, Group, Layers2, Lock, LockOpen, SendToBack, Shapes, Spline, Trash2, Ungroup } from "lucide-react"
import { groupable, ungroupable } from "../../../annotations/annotationGroups"
import type { ClearScope } from "../../../annotations/annotationTypes"
import { t } from "../../../i18n"
import { hasLevels } from "../../../levels/sceneLevels"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { ToolButton } from "../primitives/ToolButton"
import { fillIsAll, shownLock } from "./drawStyle"
import { CELLS_CHOICES, DASH_CHOICES, ENDS_CHOICES, FILL_CHOICES, FONT_CHOICES, LOOK_CHOICES, SIZE_CHOICES, type DrawToolId } from "./drawToolChoices"
import type { DrawIcon } from "./drawToolIcons"
import { ChoiceMenu, ClearMenu, ColourMenu } from "./DrawToolMenus"
import { StampSymbolTool } from "./StampSymbolTool"
import { TOOL_BAR_CHOICE_CLASS } from "./ToolOptionsBar"
import type { DrawStyleAccess } from "./useDrawStyle"
import { useBarSide } from "./barSide"

interface SwitchProps {
  icon: DrawIcon
  label: string
  tip?: string | undefined
  on: boolean
  onChange: (on: boolean) => void
  /** Why it cannot be switched now, or null. */
  locked: string | null
}

/** A tool with two states: a button that is pressed or not. */
function Switch({ icon, label, tip, on, onChange, locked }: SwitchProps): React.ReactElement {
  const subtitle = locked ?? tip
  return (
    <ToolButton icon={icon} label={label} {...(subtitle !== undefined && { subtitle })} isActive={on} pressed={on} disabled={locked !== null}
      onClick={() => onChange(!on)} className={TOOL_BAR_CHOICE_CLASS} tooltipSide={useBarSide()} />
  )
}

interface ActionProps {
  icon: DrawIcon
  label: string
  /** Why it cannot be done now, or null. */
  locked: string | null
  onClick: () => void
  /** It takes something away: its button says so in the theme's warning colour. */
  destructive?: boolean
}

/** A tool that does one thing to what is selected. */
function Action({ icon, label, locked, onClick, destructive = false }: ActionProps): React.ReactElement {
  return (
    <ToolButton icon={icon} label={label} {...(locked !== null && { subtitle: locked })} isActive={false} disabled={locked !== null} onClick={onClick}
      tooltipSide={useBarSide()} {...(destructive && { className: 'atlas-tool-bar__destructive' })} />
  )
}

/** The tools a selection that is all locked leaves at hand: its unlocking, and those that change no selected drawing. */
const FOR_LOCKED: ReadonlySet<DrawToolId> = new Set(['lock', 'group', 'ungroup', 'clear', 'eraseWhole', 'cellsLayer', 'cellsFill', 'cellsUnfill'])

interface DrawModeToolProps {
  id: DrawToolId
  access: DrawStyleAccess
  /** Why the bars take no choice now, or null. */
  locked: string | null
  /** A pick changes what is selected alone, not what the Draw tool makes next: the bar under a selection. */
  selectionOnly?: boolean
}

/**
 * One tool of a mode's bar. A switch whose selected drawings differ shows as off, and a press
 * switches all of them on. Where everything selected is locked, the tools that would change it
 * are disabled and say why.
 */
export function DrawModeTool({ id, access, locked: viewLocked, selectionOnly = false }: DrawModeToolProps): React.ReactElement {
  const { style, pick, selected, annotations } = access
  // Where a pick changes what is selected alone, a locked drawing takes none: the tools say so. The lock's own switch still works.
  const allLocked = selectionOnly && selected.length > 0 && selected.every((annotation) => annotation.locked)
  const locked = viewLocked ?? (allLocked && !FOR_LOCKED.has(id) ? t('draw.unlockFirst') : null)
  const eraseWhole = useAtlasStore((state) => state.drawTool.eraseWhole)
  const cellsLayer = useAtlasStore((state) => state.drawTool.cellsLayer)
  const cellsUnfill = useAtlasStore((state) => state.drawTool.cellsUnfill)
  const setDrawTool = useAtlasStore((state) => state.setDrawTool)
  const updateAnnotations = useAtlasStore((state) => state.updateAnnotations)
  const groupAnnotations = useAtlasStore((state) => state.groupAnnotations)
  const ungroupAnnotations = useAtlasStore((state) => state.ungroupAnnotations)
  const orderAnnotations = useAtlasStore((state) => state.orderAnnotations)
  const clearAnnotations = useAtlasStore((state) => state.clearAnnotations)
  const deleteAnnotations = useAtlasStore((state) => state.deleteAnnotations)
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  const ids = (): string[] => selected.map((annotation) => annotation.id)
  const noneSelected = locked ?? (selected.length === 0 ? t('draw.selectFirst') : null)

  switch (id) {
    case 'color': return <ColourMenu value={style.color} onChange={(color) => pick('color', color)} locked={locked} />
    case 'size': return <ChoiceMenu label={t('draw.size')} choices={SIZE_CHOICES} value={style.size} onChange={(size) => pick('size', size)} locked={locked} />
    case 'players': {
      const off = style.players === false
      return <Switch icon={off ? EyeOff : Eye} label={t('draw.players')} tip={off ? t('draw.playersOff') : undefined} on={style.players === true} onChange={(players) => pick('players', players)} locked={locked} />
    }
    case 'layer':
      return <Switch icon={Layers2} label={t('draw.onMap')} tip={t('draw.onMapTip')} on={style.layer === 'map'} onChange={(onMap) => pick('layer', onMap ? 'map' : 'above')} locked={locked} />
    case 'seeThrough': return <Switch icon={Blend} label={t('draw.seeThrough')} on={style.seeThrough === true} onChange={(on) => pick('seeThrough', on)} locked={locked} />
    case 'dash': return <ChoiceMenu label={t('draw.line')} choices={DASH_CHOICES} value={style.dash} onChange={(dash) => pick('dash', dash)} locked={locked} />
    case 'ends': return <ChoiceMenu label={t('draw.ends')} choices={ENDS_CHOICES} value={style.ends} onChange={(ends) => pick('ends', ends)} locked={locked} />
    case 'curved': return <Switch icon={Spline} label={t('draw.curved')} on={style.curved === true} onChange={(on) => pick('curved', on)} locked={locked} />
    case 'fill': {
      // A selected drawing that is nothing but its fill cannot be without one.
      const needsFill = fillIsAll(selected)
      return <ChoiceMenu label={t('draw.fill')} choices={FILL_CHOICES} value={style.fill} onChange={(fill) => pick('fill', fill)} locked={locked}
        unavailable={(fill) => (fill === null && needsFill ? t('draw.fill.noLine') : null)} />
    }
    case 'font': return <ChoiceMenu label={t('draw.font')} choices={FONT_CHOICES} value={style.font} onChange={(font) => pick('font', font)} locked={locked} />
    case 'look': return <ChoiceMenu label={t('draw.look')} choices={LOOK_CHOICES} value={style.look} onChange={(look) => pick('look', look)} locked={locked} />
    case 'icon': return <StampSymbolTool value={style.icon} onChange={(icon) => pick('icon', icon)} locked={locked} />
    // The Cells mode's own layer, shown by the Layer tool's button: a coloured cell is map more often than a mark.
    case 'cellsLayer':
      return <Switch icon={Layers2} label={t('draw.onMap')} tip={t('draw.onMapTip')} on={cellsLayer === 'map'} onChange={(onMap) => setDrawTool({ cellsLayer: onMap ? 'map' : 'above' })} locked={viewLocked} />
    case 'cellsFill':
    case 'cellsUnfill': {
      const { icon, label, tip } = CELLS_CHOICES[id]
      const unfill = id === 'cellsUnfill'
      return <Switch icon={icon} label={label} tip={tip} on={cellsUnfill === unfill} onChange={() => setDrawTool({ cellsUnfill: unfill })} locked={viewLocked} />
    }
    case 'eraseWhole':
      return <Switch icon={Shapes} label={t('draw.eraseWhole')} tip={t('draw.eraseWholeTip')} on={eraseWhole} onChange={(on) => setDrawTool({ eraseWhole: on })} locked={locked} />
    case 'front': return <Action icon={BringToFront} label={t('draw.toFront')} locked={noneSelected} onClick={() => orderAnnotations(ids(), 'front')} />
    case 'back': return <Action icon={SendToBack} label={t('draw.toBack')} locked={noneSelected} onClick={() => orderAnnotations(ids(), 'back')} />
    case 'delete': return <Action icon={Trash2} label={t('common.delete')} locked={noneSelected} destructive onClick={() => deleteAnnotations(ids())} />
    case 'lock': {
      const on = shownLock(selected) === true
      return <Switch icon={on ? Lock : LockOpen} label={t('draw.lock')} on={on} onChange={(lock) => updateAnnotations(ids(), { locked: lock ? true : undefined })} locked={viewLocked ?? (selected.length === 0 ? t('draw.selectFirst') : null)} />
    }
    case 'group':
      return <Action icon={Group} label={t('draw.group')} locked={viewLocked ?? (groupable(selected) ? null : t('draw.groupNeedsTwo'))} onClick={() => groupAnnotations(ids())} />
    case 'ungroup':
      return <Action icon={Ungroup} label={t('draw.ungroup')} locked={viewLocked ?? (ungroupable(selected) ? null : t('draw.ungroupNeedsGroup'))} onClick={() => ungroupAnnotations(ids())} />
    case 'clear': {
      const has = (scope: ClearScope): boolean => {
        if (scope === 'above') return annotations.some((annotation) => annotation.layer === 'above')
        if (scope === 'players') return annotations.some((annotation) => annotation.by !== null)
        return annotations.length > 0
      }
      return <ClearMenu levelled={levelled} has={has} onClear={clearAnnotations} locked={viewLocked} />
    }
  }
}
