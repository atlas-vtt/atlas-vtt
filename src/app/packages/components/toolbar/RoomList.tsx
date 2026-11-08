import React, { useState } from "react"
import { Check, Combine, Eye, EyeOff, Merge, Plus, Scissors, Trash2 } from "lucide-react"
import { t } from "../../../i18n"
import { levelObjects } from "../../../levels/levelObjects"
import { MAX_ROOMS, roomList, type Room } from "../../../lighting/rooms"
import { useAtlasStore, useViewStoreHook } from "../../../react/ViewStoreContext"
import { Button } from "../primitives/button"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { LabelTooltip } from "../primitives/tooltip"

const roomName = (room: Room, index: number): string => room.name || t('rooms.unnamed', { number: index + 1 })

interface RowButtonProps {
  label: string
  icon: React.ComponentType<{ size?: number }>
  onClick: () => void
  disabled?: boolean
}

function RowButton({ label, icon: Icon, onClick, disabled = false }: RowButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="right" label={label}>
      <Button variant="ghost" size="icon" className="atlas-room-row__button" aria-label={label} disabled={disabled} onClick={onClick}>
        <Icon size={14} />
      </Button>
    </LabelTooltip>
  )
}

/**
 * The rooms of the level shown, in the lighting menu's rooms mode: a click highlights the room
 * what is carved goes into (again: none, so the next shape is a new room), a double click names it,
 * and each row hides it (rock again), splits it, joins it into the room above or deletes it.
 */
export function RoomList(): React.ReactElement {
  const rooms = useAtlasStore((state) => roomList(levelObjects(state).rooms))
  const activeId = useAtlasStore((state) => state.activeRoomId)
  const splitting = useAtlasStore((state) => state.roomSplit)
  const actions = useViewStoreHook().getState
  const [renaming, setRenaming] = useState<string | null>(null)
  const active = rooms.find((room) => room.id === activeId)
  const split = rooms.findIndex((room) => room.id === splitting)

  const rename = (room: Room, name: string): void => {
    setRenaming(null)
    if (name.trim() !== room.name) actions().updateRoom(room.id, { name })
  }

  return (
    <div className="atlas-dropdown-section atlas-room-list">
      <div className="atlas-room-list__head">
        <span className="atlas-dropdown-label">{t('rooms.list')}</span>
        {rooms.length > 0 && <span className="atlas-room-list__count">{t('rooms.count', { count: rooms.length, max: MAX_ROOMS })}</span>}
      </div>
      {split >= 0 && <p className="atlas-rooms-hint">{t('rooms.splitHint', { name: roomName(rooms[split]!, split) })}</p>}
      {rooms.length > 0 && (
        <div className="atlas-room-list__rows" role="list">
          {rooms.map((room, index) => (
            <div key={room.id} role="listitem" className="atlas-room-row" data-active={room.id === activeId || undefined} data-hidden={room.hidden || undefined}>
              {renaming === room.id ? (
                <input
                  className="atlas-room-row__name-input"
                  aria-label={t('rooms.rename')}
                  defaultValue={room.name}
                  placeholder={roomName(room, index)}
                  autoFocus
                  onBlur={(e) => rename(room, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') rename(room, e.currentTarget.value)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="atlas-dropdown-menu-item atlas-room-row__name"
                  aria-pressed={room.id === activeId}
                  onClick={() => actions().setActiveRoom(room.id === activeId ? null : room.id)}
                  onDoubleClick={() => setRenaming(room.id)}
                >
                  <span className="atlas-dropdown-menu-item__check">{room.id === activeId && <Check className="h-4 w-4" />}</span>
                  <span className="atlas-room-row__label">{roomName(room, index)}</span>
                </Button>
              )}
              <RowButton label={t(room.hidden ? 'rooms.show' : 'rooms.hide')} icon={room.hidden ? EyeOff : Eye} onClick={() => actions().updateRoom(room.id, { hidden: !room.hidden })} />
              <RowButton label={t('rooms.split')} icon={Scissors} onClick={() => actions().setRoomSplit(room.id === splitting ? null : room.id)} />
              <RowButton label={t('rooms.merge')} icon={Merge} disabled={index === 0} onClick={() => actions().mergeRoomIntoPrevious(room.id)} />
              <RowButton label={t('rooms.delete')} icon={Trash2} onClick={() => actions().deleteRoom(room.id)} />
            </div>
          ))}
        </div>
      )}
      <DropdownMenuItem icon={Plus} label={t('rooms.new')} isActive={rooms.length > 0 && !active} disabled={rooms.length >= MAX_ROOMS} onClick={() => actions().setActiveRoom(null)} />
      <DropdownMenuItem icon={Combine} label={t('rooms.joinAll')} disabled={rooms.length < 2} onClick={() => actions().joinRooms()} />
    </div>
  )
}
