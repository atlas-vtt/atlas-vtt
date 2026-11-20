import { mapResources } from '../resources/collectionResources';
import { rulesLookup } from './mapRules';
import { setIcon, type App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { PlayerBadgeNumbers } from '../pixi/token-renderer/PlayerBadgeNumbers';
import { lendThemeIvy } from './themeIvy';
import { initiativeMaxCardsOf, playerInitiativeList, playersEntryToken, renderPlayerInitiative, sideIdsOf, type EntryToken } from './playerInitiativeList';
import { currentTurn, turnKey } from '../initiative/turnHolders';
import { mapInitiativeRules } from './mapInitiativeRules';
import { mapConditions } from '../gameSystems/mapRules';
import { PlayerSceneOverlay, type PlayerSettings } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';
import type { InitiativeLayout } from '../initiative/initiativeLayout';
import { portraitSrc } from '../utils/portraitSrc';
import { withArtViewBox } from '../initiative/art/artInset';
import { PlayerInitiativeStage } from './playerInitiativeStage';

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
  private readonly stopTheme: () => void;
  /** The theme's ivy was lent to the lists' container; read again with each scene presented and when the theme changes. */
  private ivyLent = false;
  /** How the lists come, go and move (`PlayerInitiativeStage`), as on the online player page. */
  private readonly stage = new PlayerInitiativeStage();

  constructor(private readonly app: App, private readonly settings: SettingsService) {
    super({ cls: 'atlas-player-initiative-container' }, settings);
    // The GM's layout is no player setting: the list is drawn anew when the edge or the start changes. Lists standing at
    // other edges then leave towards theirs as the new ones come in from theirs, overlapping a little
    let drawn = layoutKey(settings.initiativeLayout());
    this.stopLayout = settings.onChange(() => {
      const next = layoutKey(settings.initiativeLayout());
      if (next === drawn) return;
      drawn = next;
      this.stage.layoutChanged();
      this.refresh();
    });
    // Another theme, or none: the ivy comes or goes with the Atlas VTT theme
    const themeRef = app.workspace.on('css-change', () => {
      this.ivyLent = false;
      this.refresh();
    });
    this.stopTheme = () => app.workspace.offref(themeRef);
  }

  /** Draws anew, the lists gliding from where they stood (`PlayerInitiativeStage.glide`). */
  override refresh(): void {
    const before = this.stage.measure();
    super.refresh();
    this.stage.glide(before);
  }

  override destroy(): void {
    this.stopLayout();
    this.stopTheme();
    super.destroy();
  }

  override present(store: StoreApi<ViewAtlasState>, _diceEvents?: unknown, _rollSources?: unknown, badgeNumbers?: PlayerBadgeNumbers): void {
    this.letGoOfBadgeNumbers();
    this.badgeNumbers = badgeNumbers;
    this.stopBadgeNumbers = badgeNumbers?.onNumbersChange(() => this.redrawSoon());
    // Another scene's fight is not a turn beginning, and its lists neither arrive nor leave
    this.stage.reset();
    this.ivyLent = false;
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
    const turn = currentTurn(initiative);
    const turnFlash = this.stage.turnFlash(turn ? turnKey(turn) : null);
    // Outside a fight there is no list to show players, however the GM prepares one
    const drawn = settings.showInitiative && initiativeTrackerOpen && initiative?.isActive === true;
    this.stage.begin(container, drawn, initiative?.isActive === true, () => this.settings.initiativeTurnOptions().banner);
    if (!drawn) return;
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
    if (!this.ivyLent) {
      lendThemeIvy(container);
      this.ivyLent = true;
    }
    // One copy at every edge players sit at
    for (const dock of edges) {
      const panel = renderPlayerInitiative(container, list, {
        // Names the map shows on nameplates are no secret in the list either
        showNames: settings.showTokenNameplates,
        mapShowsNameplates: scene.mapShowsNameplates,
        fromTurn,
        dock,
        faces: facesPlayers,
        pulse: settings.initiativePulse,
        turnFlash,
        maxCards,
        badgeNumber: (tokenId) => shown.get(tokenId) ?? null,
        portraitSrc: (imagePath) => portraitSrc(this.app, imagePath),
        artViewBox: (imagePath, apply) => withArtViewBox(this.app, imagePath, apply),
        icon: setIcon,
      });
      if (panel) this.stage.add(panel);
    }
  }
}
