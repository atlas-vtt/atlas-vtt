/** What a door's badge shows of the door, unless it shows a padlock. */
export type DoorGlyph = 'closed' | 'open' | 'window-open' | 'window-closed';

/**
 * Glyphs of the door badges: silhouettes from game-icons.net (CC BY 3.0, see
 * THIRD_PARTY_NOTICES.md) on the pins' 512×512 canvas, the same double door shut and swung
 * open. They are not pin icons and are not offered in the pin palette.
 */
export const DOOR_GLYPH_PATHS: Record<DoorGlyph, string> = {
  // Atlas window frame and shutters.
  'window-open':
    'M64 64h384v384H64V64zm32 32v320h320V96H96zm144 0h32v320h-32V96zM96 240h320v32H96v-32z',
  'window-closed':
    'M64 64h384v384H64V64zm32 32v320h320V96H96zm144 0h32v320h-32V96zM112 112h112v32H112v-32zm176 0h112v32H288v-32zM112 176h112v32H112v-32zm176 0h112v32H288v-32zM112 240h112v32H112v-32zm176 0h112v32H288v-32zM112 304h112v32H112v-32zm176 0h112v32H288v-32zM112 368h112v32H112v-32zm176 0h112v32H288v-32z',
  // closed-doors by Delapouite
  closed:
    'M247 57.545c-29.212 2.622-71.312 17.137-106.37 38.172-19.394 11.637-36.707 25.19-48.83 39.178C79.68 148.882 73 163 73 176v263h174v-78h-46v16h-66v-16h-32v-66h32v-16h66v16h46V57.545zm18 0V295h46v-16h66v16h32v66h-32v16h-66v-16h-46v78h174V176c0-13-6.678-27.118-18.8-41.105-12.123-13.988-29.436-27.54-48.83-39.178C336.31 74.682 294.21 60.167 265 57.545zM153 297v62h30v-62h-30zm176 0v62h30v-62h-30zm-208 16v30h14v-30h-14zm80 0v30h110v-30H201zm176 0v30h14v-30h-14zM73 457v30h174v-30H73zm192 0v30h174v-30H265z',
  // open-gate by Delapouite
  open:
    'M192 64c-15.4 3.77-35.7 16.04-53 33.17-19.2 19.13-34.9 43.63-39.58 64.63l-.58 135.3.37 157.4 93.99-40.3L192 64zm128 0l-1.2 350.2 94 40.3.4-156.8-.6-135.9c-4.7-21-20.3-45.5-39.6-64.63-17.3-17.13-37.6-29.4-53-33.17zM57.24 94.67c-8.39 0-15 6.63-15 15.03 0 8.4 6.61 15 15 15s15-6.6 15-15-6.61-15.03-15-15.03zm397.56 0c-8.4 0-15 6.63-15 15.03 0 8.4 6.6 15 15 15s15-6.6 15-15-6.6-15.03-15-15.03zM35.5 142.7l-1.42 334h46l1.42-334h-46zm395 0l1.5 334h46l-1.5-334h-46zM159.2 231h18v48h-18v-48zm175.6 0h18v48h-18v-48z',
};
