import { EventEmitter } from 'events';
import { Howl } from 'howler';
import { disposeDiceRevealSound, playDiceReveal } from '../audio/diceRevealSound';
import { disposeDiceSounds } from '../dice3d/audio/diceSounds';
import type { DiceCrit } from '../tools/diceCrit';
import timerDingSoundUrl from '../sounds/timer-ding.wav?inline';

export interface SoundEffect {
    timerDing: string;
}

/**
 * Sounds are inlined into main.js as data URLs: Obsidian installs only
 * main.js, manifest.json and styles.css, so loose audio files never reach users.
 */
export class SoundEffectService extends EventEmitter {
    private sounds: Map<keyof SoundEffect, Howl> = new Map();
    private enabled: boolean = true;
    private volume: number = 0.7;
    private timerDingSound: Howl | null = null;

    constructor() {
        super();
        this.timerDingSound = this.loadSound('timerDing', timerDingSoundUrl, 'wav');
    }

    private loadSound(name: keyof SoundEffect, src: string, format: string): Howl {
        const sound = new Howl({
            src: [src],
            volume: this.volume,
            preload: true,
            format: [format],
            onloaderror: (_id, error) => {
                console.error(`[SoundEffectService] Failed to load ${name} sound:`, error);
            }
        });
        this.sounds.set(name, sound);
        return sound;
    }

    /** `diceVolume` is the user's dice volume, 0 to 1, on top of the effects volume. */
    playDiceResult(crit: DiceCrit, diceVolume = 1): void {
        if (!this.enabled || diceVolume <= 0) {
            return;
        }

        playDiceReveal(crit, this.volume * diceVolume).catch((error) => {
            console.error('[SoundEffectService] Error playing dice result sound:', error);
        });
    }

    playTimerDing(): void {
        if (!this.enabled || !this.timerDingSound) {
            return;
        }

        try {
            const state = this.timerDingSound.state();
            if (state === 'loaded') {
                this.timerDingSound.stop();
                this.timerDingSound.play();
            }
        } catch (error) {
            console.error('[SoundEffectService] Error playing timer ding:', error);
        }
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.emit('enabledChanged', enabled);
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        
        // Update volume for all loaded sounds
        this.sounds.forEach(sound => {
            sound.volume(this.volume);
        });
        
        this.emit('volumeChanged', this.volume);
    }

    getVolume(): number {
        return this.volume;
    }

    destroy(): void {
        // Unload all sounds
        this.sounds.forEach(sound => {
            sound.unload();
        });
        this.sounds.clear();
        this.timerDingSound = null;
        disposeDiceRevealSound();
        disposeDiceSounds();
        
        // Remove all listeners
        this.removeAllListeners();
    }
}
