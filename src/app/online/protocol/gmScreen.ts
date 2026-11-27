import { parseKeysMessage, parsePress, type KeysMessage, type PressMessage } from './gmScreenKeys.ts';
import { parseLayoutDeviceMessage, parseLayoutMessage, type LayoutDeviceMessage, type LayoutMessage } from './gmScreenLayoutEdits.ts';
import { parseLookMessage, type LookMessage } from './gmScreenLook.ts';
import { parseStatblockRollAnswer, parseStatblockRollPress, type StatblockRollAnswer, type StatblockRollPress } from './gmScreenStatblockRolls.ts';
import { parseStatblocksAsk, parseStatblocksMessage, type StatblocksAsk, type StatblocksMessage } from './gmScreenStatblocks.ts';
import { parseYourCode, type YourCodeMessage } from './seat.ts';
import { isRecord } from './shape.ts';

/**
 * What a GM screen's channel carries once it is open: every message is sealed whole (`gmScreenWire.ts`),
 * and read by these parsers once its seal is opened. A message of a type an end does not know reads as
 * null and is ignored.
 */

/** From Atlas to a device: its own code (by which it comes back next session), the Keys and Sound screens' state, the Keys screen's grid, the Statblocks screen's, the colours of the GM's Obsidian. */
export type GmScreenMessage = YourCodeMessage | KeysMessage | LayoutMessage | StatblocksMessage | StatblockRollAnswer | LookMessage;

/** From a device to Atlas: a key pressed, its kind and a change to its grid, the statblock it shows, a portrait it lacks, a roll of that statblock pressed. */
export type DeviceMessage = PressMessage | LayoutDeviceMessage | StatblocksAsk | StatblockRollPress;

/** A message of Atlas as a device reads it from an opened seal, or null for anything malformed or unknown. */
export function parseGmScreenMessage(value: unknown): GmScreenMessage | null {
  if (!isRecord(value)) return null;
  if (value.t === 'your-code') return parseYourCode(value);
  if (value.t === 'look') return parseLookMessage(value);
  return parseKeysMessage(value) ?? parseLayoutMessage(value) ?? parseStatblocksMessage(value) ?? parseStatblockRollAnswer(value);
}

/** A message of a device as Atlas reads it from an opened seal, or null for anything malformed or unknown. */
export function parseDeviceMessage(value: unknown): DeviceMessage | null {
  if (!isRecord(value)) return null;
  if (value.t === 'press') return parsePress(value);
  return parseLayoutDeviceMessage(value) ?? parseStatblocksAsk(value) ?? parseStatblockRollPress(value);
}
