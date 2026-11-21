import { EventEmitter } from '../utils/typedEmitter';

export interface AudioToolSettings {
  defaultInnerRadius: number;  // World pixels
  defaultOuterRadius: number;  // World pixels
  defaultVolume: number;       // 0–1
  defaultSoundId: string;      // Default sound to place
}

/**
 * Handles audio-specific tool state: placement mode, default settings.
 * Emits events on the shared EventBus.
 */
export class AudioTool {
  private settings: AudioToolSettings;
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.settings = {
      defaultInnerRadius: 300,
      defaultOuterRadius: 600,
      defaultVolume: 0.8,
      defaultSoundId: 'fire',
    };
  }

  getSettings(): AudioToolSettings {
    return { ...this.settings };
  }

  setDefaultSoundId(soundId: string): void {
    this.settings.defaultSoundId = soundId;
    this.eventBus.emit('audio-default-sound-changed', soundId);
  }

  setDefaultRadii(inner: number, outer: number): void {
    this.settings.defaultInnerRadius = inner;
    this.settings.defaultOuterRadius = outer;
  }

  setDefaultVolume(volume: number): void {
    this.settings.defaultVolume = Math.max(0, Math.min(1, volume));
  }
}
