import { FIGHT_INTRO_HOLD_MS, PULSE_MS, TURN_FLASH_MS } from './playerInitiativeList';
import { glideHeight, outwardOf, settle } from './playerInitiativeMotion';
import { adoptGhosts, ghostsOf, playTurnMotion, snapshotTurn } from '../initiative/motion/turnMotion';
import { enterList, exitList, LIST_ARRIVAL_MS } from '../initiative/motion/listPresence';

/** How long the lists of a new layout wait before they come in, while the old ones have begun to leave. */
const LAYOUT_SWAP_DELAY_MS = 120;

/** What a drawing of the lists measured of those standing before it, by edge (`measure`, `glide`). */
export type StandingLists = ReadonlyMap<string | undefined, { height: number; places: ReturnType<typeof snapshotTurn>; ghosts: ReturnType<typeof ghostsOf> }>;

/**
 * How the players' initiative lists come, go and move, wherever they are drawn (Atlas's player window, the online
 * player page): they slide in from their edges as a fight starts, after its banner stood alone a moment, and out as
 * it ends; a list drawn anew glides from its old height and its cards from where they stood to their new places as
 * the turn passes; the card whose turn began flashes. The lists are drawn anew on every change: between `begin` and
 * the drawing's end each list drawn is handed to `add`, with `measure` before and `glide` after. Imports nothing of
 * Obsidian's or of a store's.
 */
export class PlayerInitiativeStage {
  /** The turn the list last drew (`turnKey`, null for none); undefined before a scene's first draw. */
  private turnSeen: string | null | undefined = undefined;
  /** The last drawing kept the turn it had: its cards moved because the GM reordered them, not because the turn passed. */
  private turnKept = false;
  /** When the turn the list shows began, while its border flashes. */
  private turnBegan: number | null = null;
  /** Whether the lists were drawn, and the fight ran, at the last drawing; undefined before a scene's first. */
  private listsDrawn: boolean | undefined = undefined;
  private fightRan: boolean | undefined = undefined;
  /** When the lists began to arrive and how long they wait before sliding in. */
  private arrival: { at: number; delay: number } | null = null;
  /** The lists drawn last, and those of an ended fight sliding out, put back into every drawing until they are gone. */
  private drawnPanels: HTMLElement[] = [];
  private leaving: HTMLElement[] = [];

  /** The lists drawn last. */
  get panels(): readonly HTMLElement[] {
    return this.drawnPanels;
  }

  /** Another scene: its lists neither arrive nor leave, and its fight's turn is no turn beginning. */
  reset(): void {
    this.turnSeen = undefined;
    this.turnKept = false;
    this.turnBegan = null;
    this.listsDrawn = undefined;
    this.fightRan = undefined;
    this.arrival = null;
    this.drawnPanels = [];
    for (const panel of this.leaving) panel.remove();
    this.leaving = [];
  }

  /** The GM laid the lists out anew: those standing leave towards their edges as the new ones come in from theirs, overlapping a little. */
  layoutChanged(): void {
    const container = this.drawnPanels[0]?.parentElement;
    if (!container || typeof container.animate !== 'function') return;
    this.sendOff(container, this.drawnPanels, 0);
    this.drawnPanels = [];
    this.arrival = { at: performance.now(), delay: LAYOUT_SWAP_DELAY_MS };
  }

  /** The lists standing, measured before they are drawn anew. */
  measure(): StandingLists {
    return new Map(this.drawnPanels.map((panel) => {
      const list = panel.querySelector<HTMLElement>('.atlas-initiative-panel__list');
      return [panel.dataset.edge, { height: panel.offsetHeight, places: snapshotTurn(list), ghosts: ghostsOf(list) }];
    }));
  }

  /**
   * After a drawing: a list that stands at an edge it stood at before glides from its old height (`glideHeight`), and
   * its cards from where they stood to their new places (`playTurnMotion`), the copies still sliding out laid over it again.
   * Where the turn stayed (`turnFlash`), each card glides straight to its new place: a card the GM dragged up or down
   * the order moves there, rather than going round the list as the turn's holder does.
   */
  glide(before: StandingLists): void {
    for (const panel of this.drawnPanels) {
      const was = before.get(panel.dataset.edge);
      if (was === undefined) continue;
      // A list coming in has its own motion (`enterList`), which a glide would fight
      if (!this.arriving()) {
        const list = panel.querySelector<HTMLElement>('.atlas-initiative-panel__list');
        adoptGhosts(list, was.ghosts);
        playTurnMotion(list, was.places, { wrap: !this.turnKept });
      }
      if (typeof panel.animate === 'function') glideHeight(panel, was.height);
    }
  }

  /**
   * How long ago the turn `key` (`turnKey`, null for none) began, while its border flashes; undefined otherwise.
   * A turn the list saw begin flashes, the first look at a running fight does not, and a redraw during the flash
   * takes it up where it was.
   */
  turnFlash(key: string | null): number | undefined {
    this.turnKept = key === this.turnSeen;
    if (key !== this.turnSeen) {
      this.turnBegan = this.turnSeen !== undefined && key !== null ? performance.now() : null;
      this.turnSeen = key;
    }
    if (this.turnBegan === null) return undefined;
    const elapsed = performance.now() - this.turnBegan;
    return elapsed < TURN_FLASH_MS ? elapsed : undefined;
  }

  /**
   * Before the lists are drawn into `container` (emptied): they slide in from their edges when they come to be shown,
   * after a fight's banner (`bannerOn`, asked only as a fight starts or ends) has stood alone a moment where it starts, at once otherwise; as they stop being
   * shown they slide out again, kept in the container meanwhile. A scene's first look shows them as they are.
   */
  begin(container: HTMLElement, drawn: boolean, fightRuns: boolean, bannerOn: () => boolean): void {
    // A fight's start or end shows its banner at the lists first (`TurnBannerStage`)
    const bannerFirst = fightRuns !== this.fightRan && this.fightRan !== undefined && bannerOn();
    if (drawn && this.listsDrawn === false) {
      const started = fightRuns && bannerFirst;
      this.arrival = { at: performance.now(), delay: started ? FIGHT_INTRO_HOLD_MS : 0 };
      for (const panel of this.leaving) panel.remove();
      this.leaving = [];
    }
    if (!drawn && this.listsDrawn === true && typeof container.animate === 'function') {
      this.arrival = null;
      this.sendOff(container, this.drawnPanels, !fightRuns && bannerFirst ? FIGHT_INTRO_HOLD_MS : 0);
    }
    this.drawnPanels = [];
    this.keepLeaving(container);
    this.listsDrawn = drawn;
    this.fightRan = fightRuns;
  }

  /** A list drawn: while the lists arrive it slides on from where the last drawing's was. */
  add(panel: HTMLElement): void {
    this.drawnPanels.push(panel);
    this.slideIn(panel);
  }

  /** `panels` leave towards their edges after `delay` (`exitList`), kept in the container until they are gone. */
  private sendOff(container: HTMLElement, panels: readonly HTMLElement[], delay: number): void {
    for (const panel of panels) {
      panel.classList.add('atlas-player-initiative--leaving');
      panel.setAttribute('aria-hidden', 'true');
      settle(panel);
      // Back in the container first: a list out of the document measures nothing, and slid only its margin
      container.append(panel);
      this.leaving.push(panel);
      const gone = (): void => {
        panel.remove();
        this.leaving = this.leaving.filter((other) => other !== panel);
      };
      const leaving = exitList(panel, outwardOf(panel), delay);
      if (leaving) leaving.finished.then(gone, gone);
      else gone();
    }
  }

  /** The lists still leaving are put back into every drawing until they are gone. */
  private keepLeaving(container: HTMLElement): void {
    for (const panel of this.leaving) {
      // Its pulse starts again as it is put back: in step with the clock again
      if (panel.style.getPropertyValue('--atlas-pulse-phase')) panel.style.setProperty('--atlas-pulse-phase', `${-Math.round(performance.now() % PULSE_MS)}ms`);
      container.append(panel);
    }
  }

  /** Whether the lists are still coming in (`slideIn`); an arrival that is over is forgotten. */
  private arriving(): boolean {
    if (this.arrival && performance.now() - this.arrival.at >= this.arrival.delay + LIST_ARRIVAL_MS) this.arrival = null;
    return this.arrival !== null;
  }

  /**
   * A list drawn while the lists arrive slides on from where the last drawing's was. It starts once this drawing is done:
   * the turn banner, drawn after the lists, measures them where they will stand (`turnBannerAnchors.ts`), and nothing is
   * painted before the microtask runs.
   */
  private slideIn(panel: HTMLElement): void {
    const arrival = this.arrival;
    if (!arrival || typeof panel.animate !== 'function') return;
    queueMicrotask(() => {
      const elapsed = performance.now() - arrival.at;
      if (elapsed >= arrival.delay + LIST_ARRIVAL_MS) {
        if (this.arrival === arrival) this.arrival = null;
        return;
      }
      // Taken up where it was: a drawing during the arrival starts the motion as far along as the first one is
      enterList(panel, outwardOf(panel), arrival.delay - elapsed);
    });
  }
}
