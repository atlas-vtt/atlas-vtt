import type { App } from 'obsidian';
import type { TokenSensesResolver } from '../../creatures/tokenSensesResolver';
import { onMapRulesChange } from '../../services/mapRules';
import { mapSightRules } from '../../services/mapSightRules';
import type { ViewAtlasStore } from '../../storeFactory';
import { sameSightRules, type SightRules } from '../../vision/sightRules';

export interface SightRulesWatchDeps {
  obsApp: App;
  store: ViewAtlasStore;
  /** How each token perceives: by its own vision, else by its linked statblock. */
  senses: TokenSensesResolver;
  /** The window the canvas is in: a popout has its own frames. */
  frames: () => Window;
  /** The rules differ in what sight goes by: sight is to be worked out anew. */
  onChange: () => void;
}

/**
 * The sight rules of a view's map (the senses and conditions of the rules it plays by, and how
 * each token perceives), read once per map and again when they may have changed
 * (`onMapRulesChange`: the settings of the map's collection, the played campaign's system, the
 * user's presets, the asset index finishing its load), or a statblock that was read or edited,
 * which the resolver announces. A change is looked at once, in the
 * next frame, however many arrive until then (a bestiary announces its statblocks one by one),
 * and `onChange` is called only when the rules differ in what sight goes by (`sameSightRules`):
 * a save of other settings of the collection builds nothing, and the rules keep their senses,
 * so the sight cache still knows its tokens.
 */
export class SightRulesWatch {
  private rules: { mapPath: string | null; rules: SightRules } | null = null;
  /** The frame in which the rules are compared, while one is waited for. */
  private refresh: { id: number; from: Window } | null = null;
  /** A statblock or the rules it is read with changed: the next refresh reports a change whatever the rules compare to. */
  private sensesChanged = false;
  private readonly visionOf: NonNullable<SightRules['visionOf']> = (token) => this.deps.senses.visionOf(token);
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly deps: SightRulesWatchDeps) {
    const { obsApp, store, senses } = deps;
    // The rules' conditions decide sight too, and the resolver announces changed senses only once a
    // vision token was asked about: a preset edited before that, a campaign switch or the loaded
    // index is found here. The statblocks are the resolver's to announce.
    this.cleanups.push(onMapRulesChange(obsApp, () => store.getState().mapPath, () => this.schedule()));
    this.cleanups.push(senses.subscribe(() => this.schedule(true)));
  }

  current(): SightRules {
    const { obsApp, store } = this.deps;
    const state = store.getState();
    if (this.rules?.mapPath !== state.mapPath) this.rules = { mapPath: state.mapPath, rules: mapSightRules(obsApp, state, this.visionOf) };
    return this.rules.rules;
  }

  private schedule(senses = false): void {
    this.sensesChanged ||= senses;
    if (this.refresh !== null) return;
    const from = this.deps.frames();
    const id = from.requestAnimationFrame(() => {
      this.refresh = null;
      const { obsApp, store, onChange } = this.deps;
      const state = store.getState();
      const next = mapSightRules(obsApp, state, this.visionOf);
      const same = !this.sensesChanged && this.rules?.mapPath === state.mapPath && sameSightRules(this.rules.rules, next);
      this.sensesChanged = false;
      if (same) return;
      this.rules = { mapPath: state.mapPath, rules: next };
      onChange();
    });
    // Cancelled in the window it was asked of: the canvas may be in another by then (a popout).
    this.refresh = { id, from };
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.refresh?.from.cancelAnimationFrame(this.refresh.id);
    this.refresh = null;
  }
}
