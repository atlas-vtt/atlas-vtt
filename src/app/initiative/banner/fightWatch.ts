/**
 * The banners that say a fight began or ended: crossed swords in red as it starts, a quiet
 * one as it ends. Like the turn banner, nothing is said on a scene's load or at the first look at
 * a scene, whose fight was running (or not) before anyone watched.
 */

import { t } from '../../i18n';
import type { TurnBanner } from './turnBanner';

export type FightChange = 'started' | 'ended';

/** Follows whether a store's fight runs and says when that changed. */
export class FightWatch {
  private runs = false;
  private scene: string | null | undefined = undefined;

  next(state: { readonly initiative: { readonly isActive: boolean } | undefined; readonly mapPath: string | null; readonly isMapLoading: boolean }): FightChange | null {
    const runs = state.initiative?.isActive === true;
    const first = this.scene === undefined || this.scene !== state.mapPath || state.isMapLoading;
    const before = this.runs;
    this.scene = state.isMapLoading ? undefined : state.mapPath;
    this.runs = runs;
    if (first || before === runs) return null;
    return runs ? 'started' : 'ended';
  }

  /** Forget what was seen: the next look starts afresh. */
  reset(): void {
    this.runs = false;
    this.scene = undefined;
  }
}

/** The banner of a fight that began or ended. */
export function fightBanner(change: FightChange): TurnBanner {
  return change === 'started'
    ? { kind: 'fight-start', key: 'fight-start', round: null, title: t('initiative.combatStarted'), portrait: null }
    : { kind: 'fight-end', key: 'fight-end', round: null, title: t('initiative.combatEnded'), portrait: null };
}
