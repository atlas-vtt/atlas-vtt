import type { EventEmitter } from 'events';
import type { SoundEffectService } from './SoundEffectService';
import type { SettingsService } from './SettingsService';
import { diceSceneToShow } from '../dice3d/rollPresentation';
import type { DiceRollResult } from '../types/diceTypes';

/**
 * Plays the result sound for every roll shown as a result card, driven by the
 * same view's `dice-rolled` event that raises the card. Rolls thrown as 3D dice
 * make their own sounds.
 */
export class DiceToastObserver {
    private soundEffectService: Pick<SoundEffectService, 'playDiceResult'>;

    constructor(soundEffectService: Pick<SoundEffectService, 'playDiceResult'>, private readonly settings: Pick<SettingsService, 'getDiceDisplay'>, private readonly eventBus: EventEmitter) {
        this.soundEffectService = soundEffectService;
        this.eventBus.on('dice-rolled', this.handleDiceRolled);
    }

    private handleDiceRolled = (result: DiceRollResult): void => {
        if (diceSceneToShow(result, this.settings.getDiceDisplay())) return;
        this.soundEffectService.playDiceResult(result.crit ?? null);
    };

    destroy(): void {
        this.eventBus.off('dice-rolled', this.handleDiceRolled);
    }
}
