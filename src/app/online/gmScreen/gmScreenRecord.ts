import { JOIN_CODE_PATTERN, LINK_KEY_PATTERN, PLAYER_ID_PATTERN, SECRET_PATTERN, TABLE_CODE_PATTERN, playerName, type CampaignSeat, type GmScreenLink } from '../protocol/index.ts';
import { newLinkCode } from '../../campaigns/players/playersFile';
import { newJoinCode } from '../../utils/joinCode';
import { newLinkKey, type ChannelCrypto } from './channel/index.ts';

/** The most devices one link keeps; the room seats fewer at once. */
export const MAX_DEVICES = 16;
/** The most stopped rooms kept to be ended; an older one is left to the relay, which ends rooms nobody hosts. */
const MAX_ENDING = 8;

/** A device the GM allowed: the relay's id for it, the name it gave, its own code and when it was last connected. */
export interface GmScreenDevice {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly lastSeen: number;
}

/** A room at the relay by its code and host secret. */
export interface GmScreenRoom {
  readonly code: string;
  readonly secret: string;
}

/**
 * The GM screen as this computer keeps it, in online play's data file and never in a synced one: the
 * link (the room's lasting code and the key every channel is made from), the host secret of the room
 * while it runs (null while stopped), the devices allowed under this link, and the rooms stopped while
 * the relay could not be reached, which are ended once it can be.
 */
export interface GmScreenRecord {
  readonly link: GmScreenLink;
  readonly secret: string | null;
  readonly devices: readonly GmScreenDevice[];
  readonly ending: readonly GmScreenRoom[];
  /** The last time Atlas knew the relay held its room for it, by this computer's clock; unset before it ever did. */
  readonly heldAt?: number;
}

/** A new link with no devices and nothing running; the rooms still to be ended are kept. */
export function newGmScreenRecord(crypto: ChannelCrypto, ending: readonly GmScreenRoom[] = []): GmScreenRecord {
  return { link: { code: newLinkCode((length) => crypto.random(length)), key: newLinkKey(crypto) }, secret: null, devices: [], ending };
}

function readDevice(value: unknown): GmScreenDevice | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, code, lastSeen } = value as Record<string, unknown>;
  const shown = playerName(name);
  if (typeof id !== 'string' || !PLAYER_ID_PATTERN.test(id) || typeof code !== 'string' || !JOIN_CODE_PATTERN.test(code) || shown === null) return null;
  return { id, name: shown, code, lastSeen: typeof lastSeen === 'number' && Number.isFinite(lastSeen) ? lastSeen : 0 };
}

function readRoom(value: unknown): GmScreenRoom | null {
  if (typeof value !== 'object' || value === null) return null;
  const { code, secret } = value as Record<string, unknown>;
  return typeof code === 'string' && TABLE_CODE_PATTERN.test(code) && typeof secret === 'string' && SECRET_PATTERN.test(secret) ? { code, secret } : null;
}

/** The record from online play's data, each field checked; null where there is none or its link cannot be read. */
export function readGmScreenRecord(data: unknown): GmScreenRecord | null {
  if (typeof data !== 'object' || data === null) return null;
  const { link, secret, devices, ending, heldAt } = data as Record<string, unknown>;
  const { code, key } = typeof link === 'object' && link !== null ? (link as Record<string, unknown>) : {};
  if (typeof code !== 'string' || !TABLE_CODE_PATTERN.test(code) || typeof key !== 'string' || !LINK_KEY_PATTERN.test(key)) return null;
  const kept: GmScreenDevice[] = [];
  for (const entry of Array.isArray(devices) ? devices : []) {
    const device = readDevice(entry);
    if (device !== null && kept.length < MAX_DEVICES && !kept.some((other) => other.id === device.id || other.code === device.code)) kept.push(device);
  }
  const rooms = (Array.isArray(ending) ? ending : []).map(readRoom).filter((room) => room !== null);
  const held = typeof heldAt === 'number' && Number.isFinite(heldAt) ? { heldAt } : {};
  return { link: { code, key }, secret: typeof secret === 'string' && SECRET_PATTERN.test(secret) ? secret : null, devices: kept, ending: rooms.slice(-MAX_ENDING), ...held };
}

/** The record with `room` among the rooms to be ended. */
export const withEnding = (record: GmScreenRecord, room: GmScreenRoom): GmScreenRecord => ({ ...record, ending: [...record.ending, room].slice(-MAX_ENDING) });

/** The record with the room it runs now stopped: its secret goes to the rooms to be ended. */
export function withRoomEnding(record: GmScreenRecord): GmScreenRecord {
  if (record.secret === null) return record;
  return { ...withEnding(record, { code: record.link.code, secret: record.secret }), secret: null };
}

/** The record without the rooms to be ended that `ended` names. */
export const withoutEnding = (record: GmScreenRecord, ended: (room: GmScreenRoom) => boolean): GmScreenRecord => (record.ending.some(ended) ? { ...record, ending: record.ending.filter((room) => !ended(room)) } : record);

/** The record with a device allowed just now, under a code none of the others has; unchanged where it is known or the list is full. */
export function withDevice(record: GmScreenRecord, id: string, name: string, now: number, random?: () => number): GmScreenRecord {
  if (record.devices.length >= MAX_DEVICES || record.devices.some((device) => device.id === id)) return record;
  const code = newJoinCode(random, new Set(record.devices.map((device) => device.code)));
  return { ...record, devices: [...record.devices, { id, name, code, lastSeen: now }] };
}

export const withoutDevice = (record: GmScreenRecord, id: string): GmScreenRecord => ({ ...record, devices: record.devices.filter((device) => device.id !== id) });

/** The record with the device seen at `now`. */
export const seenAt = (record: GmScreenRecord, id: string, now: number): GmScreenRecord => ({ ...record, devices: record.devices.map((device) => (device.id === id ? { ...device, lastSeen: now } : device)) });

/** The devices as the relay's roster names them: each comes back by its own code without asking. */
export const seatsOf = (record: GmScreenRecord): CampaignSeat[] => record.devices.map(({ id, name, code }) => ({ id, name, code }));
