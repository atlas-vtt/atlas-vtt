/**
 * Why a terrain feature exists. Every hole, pit, shaft, chasm, gallery and liquid of a themed room
 * is placed only for one of its room type's reasons (`RoomTerrain.features`), and the reason
 * decides what it may be, where it is cut and how it is shaped: a builder's opening is straight and
 * follows the walls, a natural or broken one is irregular and never a plain square.
 */

import type { MessageKey } from '../../i18n';
import type { TerrainKind } from '../model';
import type { RoomTypeId } from './roomTypes';

export type FeatureReason =
  | 'minstrels-gallery'
  | 'murder-holes'
  | 'oubliette'
  | 'cistern'
  | 'collapse'
  | 'stair-well'
  | 'ballroom-gallery'
  | 'light-well'
  | 'rotted-floor'
  | 'conservatory-pool'
  | 'flooded-cellar'
  | 'fault-chasm'
  | 'sinkhole'
  | 'pitch'
  | 'cave-lake'
  | 'cave-stream'
  | 'sump'
  | 'lava-flow'
  | 'sulphur-spring';

export interface FeatureSpec {
  /** The terrain the reason may lay. */
  kinds: readonly TerrainKind[];
  /** The standing water it brings, which the water pass lays. */
  water?: 'pool' | 'shallow';
  /** Built: straight edges along the walls. Natural: an irregular, broken outline. */
  shape: 'built' | 'natural';
  /** In the room's own floor, or cut in the floor above it, over the room (a gallery overlooking a hall). */
  at: 'here' | 'above';
  ruinedOnly?: true;
  /** Only on a floor with another below it to open onto. */
  upperFloor?: true;
  /** What the feature is called where its kind's own name would not say it. */
  name?: MessageKey;
  /** For an opening cut in the floor above: the types of room up there that may hold it (one built to overlook the room below). Unset: any. */
  cutIn?: readonly RoomTypeId[];
  /** Cut beside the stairs that rise from the room through the floor above, in the room they arrive in: a stair well. */
  besideStairs?: true;
}

export const FEATURES: Readonly<Record<FeatureReason, FeatureSpec>> = {
  // An upper floor's opening overlooking the great hall, behind a balustrade.
  'minstrels-gallery': { kinds: ['gallery'], shape: 'built', at: 'above', name: 'dungeon.terrain.minstrelsGallery', cutIn: ['gallery', 'stair-hall', 'solar'] },
  // Small holes in a row over the gate passage, cut in the floor above it.
  'murder-holes': { kinds: ['murder-hole'], shape: 'built', at: 'above', cutIn: ['gate-chamber'] },
  // One shaft in the gaol, under a grate.
  oubliette: { kinds: ['pit'], shape: 'built', at: 'here' },
  cistern: { kinds: ['deep-water'], water: 'pool', shape: 'built', at: 'here' },
  collapse: { kinds: ['chasm', 'rubble-heap', 'rubble-field', 'broken-floor'], shape: 'natural', at: 'here', ruinedOnly: true },
  // The entrance hall's open stair well.
  'stair-well': { kinds: ['gallery'], shape: 'built', at: 'above', name: 'dungeon.terrain.stairWell', cutIn: ['landing', 'portrait-gallery'], besideStairs: true },
  'ballroom-gallery': { kinds: ['gallery'], shape: 'built', at: 'above', cutIn: ['landing', 'portrait-gallery'] },
  // An opening in an upper floor that lets the light from above down to the room below.
  'light-well': { kinds: ['gallery'], shape: 'built', at: 'here', upperFloor: true, name: 'dungeon.terrain.lightWell' },
  'rotted-floor': { kinds: ['broken-floor', 'chasm'], shape: 'natural', at: 'here', ruinedOnly: true },
  'conservatory-pool': { kinds: ['pool'], water: 'pool', shape: 'built', at: 'here' },
  'flooded-cellar': { kinds: [], water: 'shallow', shape: 'natural', at: 'here', ruinedOnly: true },
  // A cave's, as its geology decides them: a chasm along a fault, a collapse opening onto the floor below, a natural shaft.
  'fault-chasm': { kinds: ['chasm'], shape: 'natural', at: 'here' },
  sinkhole: { kinds: ['chasm'], shape: 'natural', at: 'here', upperFloor: true },
  pitch: { kinds: ['shaft'], shape: 'natural', at: 'here', upperFloor: true },
  // Water where it gathers: a lake in a low chamber, a stream running down to it, a sump at a stream's low end.
  'cave-lake': { kinds: ['deep-water'], shape: 'natural', at: 'here' },
  'cave-stream': { kinds: ['channel'], shape: 'natural', at: 'here' },
  sump: { kinds: ['deep-water'], shape: 'natural', at: 'here' },
  // Lava running deep down a tube, acid rising at a spring on a fault.
  'lava-flow': { kinds: ['channel'], shape: 'natural', at: 'here' },
  'sulphur-spring': { kinds: ['channel', 'deep-water'], shape: 'natural', at: 'here' },
};
