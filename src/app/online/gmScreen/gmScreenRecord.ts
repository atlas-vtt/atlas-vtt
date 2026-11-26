import { JOIN_CODE_PATTERN, LINK_KEY_PATTERN, PLAYER_ID_PATTERN, SECRET_PATTERN, TABLE_CODE_PATTERN, playerName, type CampaignSeat, type GmScreenLink } from '../protocol/index.ts';
import { newLinkCode } from '../../campaigns/players/playersFile';
import { newJoinCode } from '../../utils/joinCode';
import { newLinkKey, type ChannelCrypto } from './channel/index.ts';

/** The most devices one link keeps; the room seats fewer at once. */
export const MAX_DEVICES = 16;

/** A device the GM allowed: the relay's id for it, the name it gave, its own code and when it was last connected. */
export interface GmScreenDevice {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly lastSeen: number;
}

/**
 * The GM screen as this computer keeps it, in online play's data file and never in a synced one: the
 * link (the room's lasting code and the key every channel is made from), the host secret of the room
 * while it runs (null while stopped), and the devices allowed under this link.
 */
export interface GmScreenRecord {
  readonly link: GmScreenLink;
  readonly secret: string | null;
  readonly devices: readonly GmScreenDevice[];
}

/** A new link with no devices and nothing running. */
export function newGmScreenRecord(crypto: ChannelCrypto): GmScreenRecord {
  return { link: { code: newLinkCode((length) => crypto.random(length)), key: newLinkKey(crypto) }, secret: null, devices: [] };
}

function readDevice(value: unknown): GmScreenDevice | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, code, lastSeen } = value as Record<string, unknown>;
  const shown = playerName(name);
  if (typeof id !== 'string' || !PLAYER_ID_PATTERN.test(id) || typeof code !== 'string' || !JOIN_CODE_PATTERN.test(code) || shown === null) return null;
  return { id, name: shown, code, lastSeen: typeof lastSeen === 'number' && Number.isFinite(lastSeen) ? lastSeen : 0 };
}

/** The record from online play's data, each field checked; null where there is none or its link cannot be read. */
export function readGmScreenRecord(data: unknown): GmScreenRecord | null {
  if (typeof data !== 'object' || data === null) return null;
  const { link, secret, devices } = data as Record<string, unknown>;
  const { code, key } = typeof link === 'object' && link !== null ? (link as Record<string, unknown>) : {};
  if (typeof code !== 'string' || !TABLE_CODE_PATTERN.test(code) || typeof key !== 'string' || !LINK_KEY_PATTERN.test(key)) return null;
  const kept: GmScreenDevice[] = [];
  for (const entry of Array.isArray(devices) ? devices : []) {
    const device = readDevice(entry);
    if (device !== null && kept.length < MAX_DEVICES && !kept.some((other) => other.id === device.id || other.code === device.code)) kept.push(device);
  }
  return { link: { code, key }, secret: typeof secret === 'string' && SECRET_PATTERN.test(secret) ? secret : null, devices: kept };
}

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
