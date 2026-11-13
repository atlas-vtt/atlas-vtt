import React from "react"
import { Blend, Bold, BringToFront, Eye, EyeOff, Italic, Layers2, Lock, LockOpen, SendToBack, Shapes, Spline } from "lucide-react"
import type { ClearScope } from "../../../annotations/annotationTypes"
import { t } from "../../../i18n"
import { hasLevels } from "../../../levels/sceneLevels"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { ToolButton } from "../primitives/ToolButton"
import { shownLock } from "./drawStyle"
import { ALIGN_CHOICES, DASH_CHOICES, ENDS_CHOICES, FILL_CHOICES, FONT_CHOICES, LOOK_CHOICES, SIZE_CHOICES, type DrawToolId } from "./drawToolChoices"
import type { DrawIcon } from "./drawToolIcons"
import { ChoiceMenu, ClearMenu, ColourMenu, SymbolMenu } from "./DrawToolMenus"
import { TOOL_BAR_CHOICE_CLASS } from "./ToolOptionsBar"
import type { DrawStyleAccess } from "./useDrawStyle"

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
      onClick={() => onChange(!on)} className={TOOL_BAR_CHOICE_CLASS} />
  )
}

interface ActionProps {
  icon: DrawIcon
  label: string
  /** Why it cannot be done now, or null. */
  locked: string | null
  onClick: () => void
}

/** A tool that does one thing to what is selected. */
function Action({ icon, label, locked, onClick }: ActionProps): React.ReactElement {
  return <ToolButton icon={icon} label={label} {...(locked !== null && { subtitle: locked })} isActive={false} disabled={locked !== null} onClick={onClick} />
}

interface DrawModeToolProps {
  id: DrawToolId
  access: DrawStyleAccess
  /** Why the bars take no choice now, or null. */
  locked: string | null
}

/** One tool of a mode's bar. A switch whose selected drawings differ shows as off, and a press switches all of them on. */
export function DrawModeTool({ id, access, locked }: DrawModeToolProps): React.ReactElement {
  const { style, pick, selected, annotations } = access
  const eraseWhole = useAtlasStore((state) => state.drawTool.eraseWhole)
  const setDrawTool = useAtlasStore((state) => state.setDrawTool)
  const updateAnnotations = useAtlasStore((state) => state.updateAnnotations)
  const orderAnnotations = useAtlasStore((state) => state.orderAnnotations)
  const clearAnnotations = useAtlasStore((state) => state.clearAnnotations)
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
    case 'fill': return <ChoiceMenu label={t('draw.fill')} choices={FILL_CHOICES} value={style.fill} onChange={(fill) => pick('fill', fill)} locked={locked} />
    case 'font': return <ChoiceMenu label={t('draw.font')} choices={FONT_CHOICES} value={style.font} onChange={(font) => pick('font', font)} locked={locked} />
    case 'look': return <ChoiceMenu label={t('draw.look')} choices={LOOK_CHOICES} value={style.look} onChange={(look) => pick('look', look)} locked={locked} />
    case 'align': return <ChoiceMenu label={t('draw.align')} choices={ALIGN_CHOICES} value={style.align} onChange={(align) => pick('align', align)} locked={locked} />
    case 'bold': return <Switch icon={Bold} label={t('draw.bold')} on={style.bold === true} onChange={(on) => pick('bold', on)} locked={locked} />
    case 'italic': return <Switch icon={Italic} label={t('draw.italic')} on={style.italic === true} onChange={(on) => pick('italic', on)} locked={locked} />
    case 'icon': return <SymbolMenu value={style.icon} onChange={(icon) => pick('icon', icon)} locked={locked} />
    case 'eraseWhole':
      return <Switch icon={Shapes} label={t('draw.eraseWhole')} tip={t('draw.eraseWholeTip')} on={eraseWhole} onChange={(on) => setDrawTool({ eraseWhole: on })} locked={locked} />
    case 'front': return <Action icon={BringToFront} label={t('draw.toFront')} locked={noneSelected} onClick={() => orderAnnotations(ids(), 'front')} />
    case 'back': return <Action icon={SendToBack} label={t('draw.toBack')} locked={noneSelected} onClick={() => orderAnnotations(ids(), 'back')} />
    case 'lock': {
      const on = shownLock(selected) === true
      return <Switch icon={on ? Lock : LockOpen} label={t('draw.lock')} on={on} onChange={(lock) => updateAnnotations(ids(), { locked: lock ? true : undefined })} locked={noneSelected} />
    }
    case 'clear': {
      const has = (scope: ClearScope): boolean => {
        if (scope === 'above') return annotations.some((annotation) => annotation.layer === 'above')
        if (scope === 'players') return annotations.some((annotation) => annotation.by !== null)
        return annotations.length > 0
      }
      return <ClearMenu levelled={levelled} has={has} onClear={clearAnnotations} locked={locked} />
    }
  }
}
