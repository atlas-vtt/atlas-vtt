import { mapResources } from '../resources/collectionResources';
import { rulesLookup } from './mapRules';
import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { PlayerBadgeNumbers } from '../pixi/token-renderer/PlayerBadgeNumbers';
import { TurnPushWatch } from './playerInitiativePush';
import { lendThemeIvy } from './themeIvy';
import { FIGHT_INTRO_HOLD_MS, initiativeMaxCardsOf, LIST_LEAVE_EASING, LIST_LEAVE_MS, LIST_SLIDE_MS, playerInitiativeList, PULSE_MS, playerSegments, playersEntryToken, renderPlayerInitiative, sideIdsOf, TURN_FLASH_MS, type EntryToken } from './playerInitiativeList';
import { currentTurn, turnKey } from '../initiative/turnHolders';
import { mapInitiativeRules } from './mapInitiativeRules';
import { mapConditions } from '../gameSystems/mapRules';
import { PlayerSceneOverlay, type PlayerSettings } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';
import type { InitiativeLayout } from '../initiative/initiativeLayout';
import { portraitSrc } from '../utils/portraitSrc';
import { glideHeight, settle, slideList } from './playerInitiativeMotion';

/** What of the GM's layout the list is drawn by: drawn anew when it changes. */
const layoutKey = ({ fromTurn, edges, facesPlayers }: InitiativeLayout): string => [fromTurn, facesPlayers, ...edges].join();

interface InitiativeScene {
  initiative: ViewAtlasState['initiative'];
  initiativeTrackerOpen: boolean;
  mapPath: string | null;
  /**
   * What the list shows of every entry (`playersEntryToken`; null for one players do not see), in
   * entry order, as a key that changes when one of them does and compares equal after edits to other tokens.
   */
  tokens: string;
  /** The scene's Show nameplates, which says with each token's own whom the list names. */
  mapShowsNameplates: boolean;
}

/**
 * Read-only initiative projection; never mounts the DM tracker or its controls. While a fight runs
 * it lists the GM's combatants without those whose token is hidden, in turn order or by sides.
 * Players at the table (party entries, without a token) are always listed, on the players' side.
 * Look-alikes carry the GM's number where the players see their token (`PlayerBadgeNumbers`): the
 * list is drawn anew once the players' frame shows another set. It follows the GM's layout: the
 * edge it stands at and whether it starts at the turn.
 */
export class PlayerInitiativePanel extends PlayerSceneOverlay<InitiativeScene> {
  private badgeNumbers: PlayerBadgeNumbers | undefined;
  private stopBadgeNumbers: (() => void) | undefined;
  /** The numbers the list showed last, kept as plain data for a held list, which lets go of the renderer. */
  private shownNumbers: ReadonlyMap<string, number> = new Map();
  private redrawQueued = false;
  private readonly stopLayout: () => void;
  /** The theme's ivy was lent to the lists' container; read again with each scene presented. */
  private ivyLent = false;
  /** The turn the list last drew (`turnKey`, null for none); undefined before a scene's first draw. */
  private turnSeen: string | null | undefined = undefined;
  /** When the turn the list shows began, while its border flashes. */
  private turnBegan: number | null = null;
  /** The row's conveyor as the turn passes on. */
  private readonly pushWatch = new TurnPushWatch();
  /** Whether the lists were drawn, and the fight ran, at the last drawing; undefined before a scene's first. */
  private listsDrawn: boolean | undefined = undefined;
  private fightRan: boolean | undefined = undefined;
  /** When the lists began to arrive and how long they wait before sliding in. */
  private arrival: { at: number; delay: number } | null = null;
  /** The lists drawn last, and those of an ended fight sliding out, put back into every drawing until they are gone. */
  private drawnPanels: HTMLElement[] = [];
  private leaving: HTMLElement[] = [];

  constructor(private readonly app: App, private readonly settings: SettingsService) {
    super({ cls: 'atlas-player-initiative-container' }, settings);
    // The GM's layout is no player setting: the list is drawn anew when the edge or the start changes
    let drawn = layoutKey(settings.initiativeLayout());
    this.stopLayout = settings.onChange(() => {
      const next = layoutKey(settings.initiativeLayout());
      if (next === drawn) return;
      drawn = next;
      this.refresh();
    });
  }

  /** Draws anew; a list that stands at an edge it stood at before glides from its old height (`glideHeight`). */
  override refresh(): void {
    const heights = new Map(this.drawnPanels.map((panel) => [panel.dataset.edge, panel.offsetHeight]));
    super.refresh();
    for (const panel of this.drawnPanels) {
      const from = heights.get(panel.dataset.edge);
      if (from !== undefined && typeof panel.animate === 'function') glideHeight(panel, from);
    }
  }

  override destroy(): void {
    this.stopLayout();
    super.destroy();
  }

  override present(store: StoreApi<ViewAtlasState>, _diceEvents?: unknown, _rollSources?: unknown, badgeNumbers?: PlayerBadgeNumbers): void {
    this.letGoOfBadgeNumbers();
    this.badgeNumbers = badgeNumbers;
    this.stopBadgeNumbers = badgeNumbers?.onNumbersChange(() => this.redrawSoon());
    // Another scene's fight is not a turn beginning
    this.turnSeen = undefined;
    this.turnBegan = null;
    this.pushWatch.forget();
    this.ivyLent = false;
    // Another scene's lists neither arrive nor leave
    this.listsDrawn = undefined;
    this.fightRan = undefined;
    this.arrival = null;
    this.drawnPanels = [];
    for (const panel of this.leaving) panel.remove();
    this.leaving = [];
    super.present(store);
  }

  override hold(): void {
    this.letGoOfBadgeNumbers();
    super.hold();
  }

  /** The players' frame takes its badge numbers while it renders: the list is drawn once that render is done. */
  private redrawSoon(): void {
    if (this.redrawQueued) return;
    this.redrawQueued = true;
    queueMicrotask(() => {
      this.redrawQueued = false;
      this.refresh();
    });
  }

  private letGoOfBadgeNumbers(): void {
    this.stopBadgeNumbers?.();
    this.stopBadgeNumbers = undefined;
    this.badgeNumbers = undefined;
  }

  /**
   * How long ago the turn the list shows began, while its border flashes; undefined otherwise.
   * A turn the list saw begin flashes, the first look at a running fight does not, and a redraw
   * during the flash takes it up where it was.
   */
  private turnFlash(initiative: InitiativeScene['initiative']): number | undefined {
    const turn = currentTurn(initiative);
    const key = turn ? turnKey(turn) : null;
    if (key !== this.turnSeen) {
      this.turnBegan = this.turnSeen !== undefined && key !== null ? performance.now() : null;
      this.turnSeen = key;
    }
    if (this.turnBegan === null) return undefined;
    const elapsed = performance.now() - this.turnBegan;
    return elapsed < TURN_FLASH_MS ? elapsed : undefined;
  }

  protected select({ initiative, initiativeTrackerOpen, objects, mapPath, tokenSettings }: ViewAtlasState): InitiativeScene {
    const entries = initiative?.entries ?? [];
    // Who is defeated follows the map's resources, as on the GM's cards
    const lookup = entries.length > 0 ? rulesLookup(this.app) : null;
    const definitions = lookup ? mapResources(lookup, mapPath) : [];
    // The conditions the map draws on the tokens, as players see them there
    const conditions = lookup ? mapConditions(lookup, mapPath) : [];
    // A token's side counts where the fight or the rules know it
    const sides = entries.length > 0 && initiative ? sideIdsOf(initiative, mapInitiativeRules(this.app, mapPath ?? null)) : undefined;
    const entryTokens = JSON.stringify(entries.map((entry) => playersEntryToken(entry, objects?.tokens, definitions, conditions, sides)));
    return { initiative, initiativeTrackerOpen, mapPath: mapPath ?? null, tokens: entryTokens, mapShowsNameplates: tokenSettings?.showNameplates ?? false };
  }

  protected render(container: HTMLElement, scene: InitiativeScene, settings: PlayerSettings): void {
    const { initiative, initiativeTrackerOpen } = scene;
    const turnFlash = this.turnFlash(initiative);
    // Outside a fight there is no list to show players, however the GM prepares one
    const drawn = settings.showInitiative && initiativeTrackerOpen && initiative?.isActive === true;
    this.arriveOrLeave(container, drawn, initiative?.isActive === true);
    if (!drawn) {
      this.pushWatch.forget();
      return;
    }
    const tokenOf = JSON.parse(scene.tokens) as (EntryToken | null)[];
    // Players see HP where the map's rules show it to them
    const hpVisible = mapResources(rulesLookup(this.app), scene.mapPath).some((definition) => definition.key === 'hp' && definition.visibleToPlayers);
    const list = playerInitiativeList(
      initiative,
      (_entry, index) => tokenOf[index] ?? null,
      mapInitiativeRules(this.app, scene.mapPath),
      hpVisible,
    );
    const live = this.badgeNumbers;
    const held = this.shownNumbers;
    const shown = new Map<string, number>();
    for (const { entry: { tokenId } } of list.combatants) {
      // A player at the table has no token, nor a badge
      if (tokenId === undefined) continue;
      const number = live ? live.numberOf(tokenId) : held.get(tokenId) ?? null;
      if (number !== null) shown.set(tokenId, number);
    }
    this.shownNumbers = shown;
    const { fromTurn, edges, facesPlayers } = this.settings.initiativeLayout();
    const maxCards = initiativeMaxCardsOf(settings.initiativeMaxCards);
    const push = this.pushWatch.see(playerSegments(list, fromTurn, maxCards), list, fromTurn);
    if (!this.ivyLent) {
      lendThemeIvy(container);
      this.ivyLent = true;
    }
    // One copy at every edge players sit at
    this.drawnPanels = [];
    for (const dock of edges) {
      const panel = renderPlayerInitiative(container, list, {
        // Names the map shows on nameplates are no secret in the list either; the initiative names show every name
        showNames: settings.showTokenNameplates || settings.showInitiativeNames,
        mapShowsNameplates: settings.showInitiativeNames || scene.mapShowsNameplates,
        fromTurn,
        dock,
        faces: facesPlayers,
        pulse: settings.initiativePulse,
        turnFlash,
        push,
        maxCards,
        badgeNumber: (tokenId) => shown.get(tokenId) ?? null,
        portraitSrc: (imagePath) => portraitSrc(this.app, imagePath),
      });
      if (!panel) continue;
      this.drawnPanels.push(panel);
      this.slideIn(panel, facesPlayers);
    }
  }

  /**
   * The lists slide in from their edges when they come to be shown: after a fight's banner has stood alone a moment
   * where it starts, at once otherwise. As they stop being shown they slide out again, kept in the container meanwhile.
   * A scene's first look shows them as they are.
   */
  private arriveOrLeave(container: HTMLElement, drawn: boolean, fightRuns: boolean): void {
    // A fight's start or end shows its banner at the lists first (`PlayerTurnBanner`)
    const bannerFirst = fightRuns !== this.fightRan && this.fightRan !== undefined && this.settings.initiativeTurnOptions().banner;
    if (drawn && this.listsDrawn === false) {
      const started = fightRuns && bannerFirst;
      this.arrival = { at: performance.now(), delay: started ? FIGHT_INTRO_HOLD_MS : 0 };
      for (const panel of this.leaving) panel.remove();
      this.leaving = [];
    }
    if (!drawn && this.listsDrawn === true && typeof container.animate === 'function') {
      this.arrival = null;
      this.leaving = this.drawnPanels;
      const delay = !fightRuns && bannerFirst ? FIGHT_INTRO_HOLD_MS : 0;
      for (const panel of this.leaving) {
        panel.addClass('atlas-player-initiative--leaving');
        panel.setAttribute('aria-hidden', 'true');
        settle(panel);
        // Back in the emptied container first: a list out of the document measures nothing, and slid only its margin
        container.append(panel);
        const gone = (): void => {
          panel.remove();
          this.leaving = this.leaving.filter((other) => other !== panel);
        };
        slideList(panel, this.settings.initiativeLayout().facesPlayers, true, { duration: LIST_LEAVE_MS, delay, easing: LIST_LEAVE_EASING, fill: 'forwards' }).finished.then(gone, gone);
      }
    }
    if (!drawn) {
      this.drawnPanels = [];
      for (const panel of this.leaving) {
        // Its pulse starts again as it is put back: in step with the clock again
        if (panel.style.getPropertyValue('--atlas-pulse-phase')) panel.style.setProperty('--atlas-pulse-phase', `${-Math.round(performance.now() % PULSE_MS)}ms`);
        container.append(panel);
      }
    }
    this.listsDrawn = drawn;
    this.fightRan = fightRuns;
  }

  /**
   * A list drawn while the lists arrive slides on from where the last drawing's was. It starts once this drawing is done:
   * the turn banner, an overlay drawn after this one, measures the lists where they will stand (`turnBannerAnchors.ts`),
   * and nothing is painted before the microtask runs.
   */
  private slideIn(panel: HTMLElement, faces: boolean): void {
    const arrival = this.arrival;
    if (!arrival || typeof panel.animate !== 'function') return;
    queueMicrotask(() => {
      const elapsed = performance.now() - arrival.at;
      if (elapsed >= arrival.delay + LIST_SLIDE_MS) {
        if (this.arrival === arrival) this.arrival = null;
        return;
      }
      slideList(panel, faces, false, { duration: LIST_SLIDE_MS, delay: arrival.delay - elapsed, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
    });
  }
}
