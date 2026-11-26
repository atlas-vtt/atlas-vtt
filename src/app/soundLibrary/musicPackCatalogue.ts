import type { PackedFile } from '../services/stockPacks/verifiedFetch';

/** What the offer says of a pack before its manifest is fetched. Written by the pack builder from the manifest it pins. */
export interface MusicPackSummary {
  id: string;
  name: string;
  tracks: number;
  bytes: number;
  /** How long its tracks play together. */
  seconds: number;
}

export const MUSIC_MANIFEST: PackedFile = { key: 'manifest-2.json', bytes: 66265, sha256: 'ab9c09047eb8bfea98d2d321c3270464264890dc3bef6abd71f029514652c255' };

export const MUSIC_PACKS: readonly MusicPackSummary[] = [
  { id: 'tavern', name: 'Tavern and town', tracks: 32, bytes: 83975147, seconds: 6944 },
  { id: 'journey', name: 'Journey and adventure', tracks: 60, bytes: 157936364, seconds: 13077 },
  { id: 'wilds', name: 'Forest and fae', tracks: 40, bytes: 108537544, seconds: 8983 },
  { id: 'calm', name: 'Rest and reflection', tracks: 50, bytes: 140030362, seconds: 11593 },
  { id: 'sorrow', name: 'Sorrow and farewell', tracks: 59, bytes: 158810305, seconds: 13145 },
  { id: 'mystery', name: 'Mystery and magic', tracks: 39, bytes: 104398201, seconds: 8652 },
  { id: 'dread', name: 'Dread and darkness', tracks: 24, bytes: 62892384, seconds: 5204 },
  { id: 'battle', name: 'Battle and glory', tracks: 37, bytes: 94932844, seconds: 7879 },
  { id: 'winter', name: 'Winter and yule', tracks: 18, bytes: 47586048, seconds: 3940 },
  { id: 'realms', name: 'Ambient soundscapes', tracks: 6, bytes: 262035217, seconds: 21600 },
];
