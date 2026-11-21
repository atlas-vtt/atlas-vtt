import type { PackedFile } from '../services/stockPacks/verifiedFetch';

/** What the offer says of a pack before its manifest is fetched. Written by the pack builder from the manifest it pins. */
export interface MusicPackSummary {
  id: string;
  name: string;
  tracks: number;
  bytes: number;
}

export const MUSIC_MANIFEST: PackedFile = { key: 'manifest.json', bytes: 66258, sha256: '043ce22063a833459afdd97ffa814ab92d9c8e492f1c4bf988794ecf1b9a8c81' };

export const MUSIC_PACKS: readonly MusicPackSummary[] = [
  { id: 'tavern', name: 'Tavern and town', tracks: 32, bytes: 83975147 },
  { id: 'journey', name: 'Journey and adventure', tracks: 60, bytes: 157936364 },
  { id: 'wilds', name: 'Forest and fae', tracks: 40, bytes: 108537544 },
  { id: 'calm', name: 'Rest and reflection', tracks: 50, bytes: 140030362 },
  { id: 'sorrow', name: 'Sorrow and farewell', tracks: 59, bytes: 158810305 },
  { id: 'mystery', name: 'Mystery and magic', tracks: 39, bytes: 104398201 },
  { id: 'dread', name: 'Dread and darkness', tracks: 24, bytes: 62892384 },
  { id: 'battle', name: 'Battle and glory', tracks: 37, bytes: 94932844 },
  { id: 'winter', name: 'Winter and yule', tracks: 18, bytes: 47586048 },
  { id: 'realms', name: 'Endless realms', tracks: 6, bytes: 262035217 },
];
