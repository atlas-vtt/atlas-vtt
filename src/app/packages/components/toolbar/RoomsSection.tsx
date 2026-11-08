import React from "react"
import { t } from "../../../i18n"
import type { RoomToolOptions } from "../../../stores/roomsSlice"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { SegmentedControl, type SegmentedOption } from "../primitives/SegmentedControl"
import { RoomList } from "./RoomList"

const ACTIONS: readonly SegmentedOption<RoomToolOptions['action']>[] = [
  { value: 'carve', label: t('rooms.carve') },
  { value: 'fill', label: t('rooms.fill') },
  { value: 'door', label: t('rooms.door') },
]

const SHAPES: readonly SegmentedOption<RoomToolOptions['shape']>[] = [
  { value: 'rectangle', label: t('rooms.rectangle') },
  { value: 'polygon', label: t('rooms.points') },
  { value: 'lasso', label: t('rooms.lasso') },
  { value: 'brush', label: t('rooms.brush') },
]

interface RoomsSectionProps {
  options: RoomToolOptions
  onChange: (changes: Partial<RoomToolOptions>) => void
}

/**
 * The rooms mode's choices in the lighting tool's menu: carve rooms, fill rock back in or place
 * doors, the stroke's shape and the brush's size, then the rooms of the level shown.
 */
export function RoomsSection({ options, onChange }: RoomsSectionProps): React.ReactElement {
  const door = options.action === 'door'
  return (
    <>
      <div className="atlas-dropdown-section atlas-explored-brush">
        <SegmentedControl value={options.action} options={ACTIONS} ariaLabel={t('rooms.action')} onChange={(action) => onChange({ action })} />
        {!door && <SegmentedControl value={options.shape} options={SHAPES} ariaLabel={t('rooms.shape')} onChange={(shape) => onChange({ shape })} />}
        {!door && options.shape === 'brush' && (
          <DropdownSliderRow label={t('rooms.brushSize')} value={options.brushSize} min={10} max={300} onChange={(brushSize) => onChange({ brushSize })} />
        )}
        <p className="atlas-rooms-hint">{door ? t('rooms.doorHint') : t('rooms.hint')}</p>
      </div>
      <RoomList />
    </>
  )
}
