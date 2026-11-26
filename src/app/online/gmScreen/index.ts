/**
 * The GM screen's session on Atlas's side, free of Obsidian: what a host (Atlas, or a scripted Atlas in
 * a test) builds a session from, and what screens plug into it.
 */
export { GmScreenSession } from './GmScreenSession.ts';
export type { GmScreenPorts } from './gmScreenPorts.ts';
export { gmScreenView, type GmScreenDeviceView, type GmScreenStatus, type GmScreenView } from './gmScreenView.ts';
export { MAX_DEVICES, newGmScreenRecord, readGmScreenRecord, type GmScreenDevice, type GmScreenRecord } from './gmScreenRecord.ts';
export { relayRooms, type CreateRoom, type RoomAccount, type RoomAnswer } from './gmScreenRoom.ts';
export type { Knock } from './gmScreenKnocks.ts';
export type { DeviceMessageType, GmScreen, GmScreenOutlet } from './screens.ts';
