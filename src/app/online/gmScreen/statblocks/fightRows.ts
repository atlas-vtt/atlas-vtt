import type { StatblocksFight } from '../../protocol/index.ts';
import { fightOf, type FightInputs } from './fightList.ts';
import type { FrontScene, FrontSceneState } from './frontScene.ts';
import { ScreenIds } from './screenIds.ts';

/**
 * The running fight as the Statblocks screen reads it for devices (`fightOf`), each fight with keys for its combatants
 * of its own, let go with it. A fight that cannot be read is left out, and the list goes on without it.
 */
export class FightRows {
  private keys: ScreenIds | null = null;
  private fights = 0;

  constructor(private readonly prefix: string) {}

  /** The fight of `state`, by the rules of `scene`'s map; null outside a fight and where it cannot be read. */
  read(scene: Pick<FrontScene, 'rules'>, state: FrontSceneState, inputs: Omit<FightInputs, 'keyOf' | 'rules'>): StatblocksFight | null {
    if (!state.initiative.isActive) {
      this.keys = null;
      return null;
    }
    const keys = (this.keys ??= new ScreenIds(`${this.prefix}${(this.fights += 1)}-`));
    try {
      return fightOf(state, { ...inputs, rules: scene.rules(), keyOf: (entryId) => keys.of(entryId) });
    } catch (error) {
      console.error('[Atlas] Could not read the fight for a GM screen device:', error);
      return null;
    }
  }
}
