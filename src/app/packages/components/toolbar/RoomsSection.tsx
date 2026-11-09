import React from "react"
import { Brush, DoorOpen, Lasso, PaintBucket, PenTool, Pickaxe, Square } from "lucide-react"
import { t } from "../../../i18n"
import type { RoomToolOptions } from "../../../stores/roomsSlice"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { SegmentedControl, type SegmentedOption } from "../primitives/SegmentedControl"

/** What a stroke does: icons only, named and explained by their tooltips (the keys that turn them around included). */
const ACTIONS: readonly SegmentedOption<RoomToolOptions['action']>[] = [
  { value: 'carve', label: '', icon: <Pickaxe />, ariaLabel: t('rooms.carve'), hint: t('rooms.carveTip') },
  { value: 'fill', label: '', icon: <PaintBucket />, ariaLabel: t('rooms.fill'), hint: t('rooms.fillTip') },
  { value: 'door', label: '', icon: <DoorOpen />, ariaLabel: t('rooms.door'), hint: t('rooms.doorHint') },
]

const SHAPES: readonly SegmentedOption<RoomToolOptions['shape']>[] = [
  { value: 'rectangle', label: '', icon: <Square />, ariaLabel: t('rooms.rectangle'), hint: t('rooms.rectangleTip') },
  { value: 'polygon', label: '', icon: <PenTool />, ariaLabel: t('rooms.points'), hint: t('rooms.pointsTip') },
  { value: 'lasso', label: '', icon: <Lasso />, ariaLabel: t('rooms.lasso'), hint: t('rooms.lasso') },
  { value: 'brush', label: '', icon: <Brush />, ariaLabel: t('rooms.brush'), hint: t('rooms.brush') },
]

interface RoomsSectionProps {
  options: RoomToolOptions
  onChange: (changes: Partial<RoomToolOptions>) => void
}

/**
 * The rooms mode's tools in the lighting tool's menu, in one row: carve, fill in or door, then the
 * stroke's shape, which a door does not use (shown disabled, so the row keeps its shape), and the
 * brush's size. The rooms themselves are listed in the Rooms panel beside the map (`RoomsPanel`).
 */
export function RoomsSection({ options, onChange }: RoomsSectionProps): React.ReactElement {
  const door = options.action === 'door'
  return (
    <div className="atlas-dropdown-section atlas-rooms-tools">
      <div className="atlas-rooms-tools__row">
        <SegmentedControl value={options.action} options={ACTIONS} ariaLabel={t('rooms.action')} onChange={(action) => onChange({ action })} />
        <SegmentedControl value={options.shape} options={SHAPES} ariaLabel={t('rooms.shape')} disabled={door} onChange={(shape) => onChange({ shape })} />
      </div>
      {options.shape === 'brush' && (
        <DropdownSliderRow label={t('rooms.brushSize')} value={options.brushSize} min={10} max={300} disabled={door} onChange={(brushSize) => onChange({ brushSize })} />
      )}
    </div>
  )
}
