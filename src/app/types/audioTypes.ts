import type { OnLevels } from './sceneLevelTypes';

export type SoundCategory = 'Nature' | 'Interior' | 'Action' | 'Atmosphere' | 'Custom';

export interface AudioSource extends OnLevels {
  id: string;
  kind: 'audio';
  x: number;                    // World pixels
  y: number;
  innerRadius: number;          // Full volume radius (world pixels)
  outerRadius: number;          // Falloff-to-zero radius (world pixels)
  volume: number;               // Base volume 0–1
  soundId: string;              // References built-in or custom sound
  loop: boolean;                // Default true for ambience
}

/** Input for creating an audio source (without auto-generated id/kind) */
export type AudioInput = Omit<AudioSource, 'id' | 'kind'>;

export interface SoundMeta {
  id: string;                   // e.g. 'fire' or 'custom:my-sound.ogg'
  name: string;                 // Display name
  category: SoundCategory;
  path: string;                 // Path to audio file
}
