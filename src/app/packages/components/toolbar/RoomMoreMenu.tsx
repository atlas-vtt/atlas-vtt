import React, { useCallback, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { t } from "../../../i18n"
import { BUCKET_RADIUS, BUCKET_SENSITIVITY } from "../../../lighting/bucketFill/bucketFill"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { BRUSH_SIZE, roomSizesOf } from "../../../stores/roomsSlice"
import { DropdownMenu } from "../primitives/DropdownMenu"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { ToolButton } from "../primitives/ToolButton"

/**
 * The rooms mode's menu at the end of its bar: the brush's size, how the bucket pours and Stabilization. Every row
 * stays whatever the shape, disabled where it means nothing now, so the menu keeps its shape; the
 * bucket's rows are there only while its experimental feature is on.
 */
export function RoomMoreMenu({ locked, bucketOn }: { locked: string | null; bucketOn: boolean }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const toggle = useCallback((): void => setOpen((before) => !before), [])
  const roomTool = useAtlasStore((state) => state.roomTool)
  const setRoomTool = useAtlasStore((state) => state.setRoomTool)
  const brushSize = useAtlasStore((state) => roomSizesOf(state).brushSize)
  const bucketRadius = useAtlasStore((state) => roomSizesOf(state).bucketRadius)
  const off = locked !== null || roomTool.action === 'door'
  const brush = !off && (roomTool.shape === 'brush' || roomTool.shape === 'bucket')
  const bucket = !off && roomTool.shape === 'bucket'
  return (
    <DropdownMenu
      isOpen={open}
      onToggle={toggle}
      label={t('fog.more')}
      position="top"
      align="right"
      // The wrapper around the trigger takes the click.
      triggerButton={<ToolButton icon={MoreHorizontal} label={t('fog.more')} isActive={false} menuExpanded={open} onClick={() => undefined} />}
    >
      <div className="atlas-dropdown-section">
        <DropdownSliderRow label={t('rooms.brushSize')} value={brushSize} min={BRUSH_SIZE.min} max={BRUSH_SIZE.max} disabled={!brush}
          onChange={(brushSize) => setRoomTool({ brushSize })} />
        {bucketOn && <>
          <DropdownSliderRow label={t('rooms.bucketRadius')} value={bucketRadius} min={BUCKET_RADIUS.min} max={BUCKET_RADIUS.max} step={BUCKET_RADIUS.step}
            disabled={!bucket} onChange={(bucketRadius) => setRoomTool({ bucketRadius })} />
          <DropdownSliderRow label={t('rooms.bucketSensitivity')} value={roomTool.bucketSensitivity} min={BUCKET_SENSITIVITY.min} max={BUCKET_SENSITIVITY.max}
            disabled={!bucket} format={String} onChange={(bucketSensitivity) => setRoomTool({ bucketSensitivity })} />
        </>}
        <DropdownToggleRow label={t('rooms.stabilize')} value={roomTool.stabilize} disabled={!brush}
          onChange={() => setRoomTool({ stabilize: !roomTool.stabilize })} />
      </div>
    </DropdownMenu>
  )
}
