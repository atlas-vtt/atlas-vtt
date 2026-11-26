/**
 * The encrypted channel between Atlas and one GM screen device, shared by both: Atlas imports it here,
 * the device's page from Atlas's source. It names no global and imports nothing of Obsidian; the
 * platform's cryptography is handed in (`channelCryptoOf`).
 */
export { channelCryptoOf, checkNumber, linkKey, newLinkKey, type ChannelCrypto } from './channelKeys';
export type { ChannelEvents } from './channelCodec';
export { DeviceChannel } from './DeviceChannel';
export { GmChannel } from './GmChannel';
export type { ChannelTimers } from './openingPace';
