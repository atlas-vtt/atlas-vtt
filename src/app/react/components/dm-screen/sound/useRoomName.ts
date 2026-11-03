import { Church, DoorOpen, Landmark, Mountain, type LucideIcon } from 'lucide-react';
import { t } from '../../../../i18n';
import { DEFAULT_ROOM, type RoomId } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useSoundValue } from './useSound';

/** A room's glyph beside its name. */
export const ROOM_ICONS: Readonly<Record<RoomId, LucideIcon>> = { room: DoorOpen, hall: Landmark, cave: Mountain, cathedral: Church };

/** A room's name as the page shows it. */
export const roomName = (id: RoomId): string => t(`audio.room.${id}`);

/** The room the mix rings in now. */
export function useRoom(director: SoundDirector): RoomId {
  return useSoundValue(director, ({ mix }) => mix.table.room?.id ?? DEFAULT_ROOM);
}

export const useRoomName = (director: SoundDirector): string => roomName(useRoom(director));
