import { mapResources } from '../resources/collectionResources';
import { AssetService } from './AssetService';
import type { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { entryTokenOf, listedForPlayers, playerInitiativeList, renderPlayerInitiative, type EntryToken } from './playerInitiativeList';
import { mapInitiativeRules } from './mapInitiativeRules';
import { PlayerSceneOverlay, type PlayerSettings, type PlayerSettingsSource } from './PlayerSceneOverlay';

/** Separates token ids in `InitiativeScene.visibleTokenIds`. */
const TOKEN_ID_SEPARATOR = '\n';

interface InitiativeScene {
  initiative: ViewAtlasState['initiative'];
  initiativeTrackerOpen: boolean;
  /** Initiative tokens players may see, joined into a key so edits to other tokens compare equal. */
  visibleTokenIds: string;
  mapPath: string | null;
  /** The remote view's list is grouped by the rules its owner feeds (`remoteView.initiativeRules`), not by the player's own collection; null elsewhere. */
  remoteRules: InitiativeRules | null;
  /** The remote view's list: its owner decides which combatants show a bar (`remoteView.initiativeHealth`). */
  remote: boolean;
  /** What the list shows of every initiative token (`EntryToken`), in entry order, as a key that changes when one of them does. */
  tokens: string;
}

/**
 * Read-only initiative projection; never mounts the DM tracker or its controls. It lists the
 * GM's combatants without those whose token is hidden, in turn order or by sides as the fight runs.
 */
export class PlayerInitiativePanel extends PlayerSceneOverlay<InitiativeScene> {
  constructor(private readonly app: App, settings: PlayerSettingsSource) {
    super({ cls: 'atlas-player-initiative-container' }, settings);
  }

  protected select({ initiative, initiativeTrackerOpen, objects, mapPath, remoteView }: ViewAtlasState): InitiativeScene {
    const tokens = objects?.tokens;
    const entries = initiative?.entries ?? [];
    const visibleTokenIds = entries
      .filter((entry) => listedForPlayers(tokens?.[entry.tokenId]))
      .map((entry) => entry.tokenId)
      .join(TOKEN_ID_SEPARATOR);
    const entryTokens = JSON.stringify(entries.map((entry): EntryToken => {
      const token = entryTokenOf(tokens?.[entry.tokenId]);
      if (!remoteView) return token;
      const hp = Object.hasOwn(remoteView.initiativeHealth, entry.tokenId) ? remoteView.initiativeHealth[entry.tokenId] : undefined;
      return { ...token, hp: hp ?? null };
    }));
    return { initiative, initiativeTrackerOpen, visibleTokenIds, mapPath: mapPath ?? null, remoteRules: remoteView?.initiativeRules ?? null, remote: remoteView != null, tokens: entryTokens };
  }

  protected render(container: HTMLElement, scene: InitiativeScene, settings: PlayerSettings): void {
    const { initiative, initiativeTrackerOpen } = scene;
    if (!settings.showInitiative || !initiativeTrackerOpen || !initiative) return;
    const visibleTokenIds = new Set(scene.visibleTokenIds.split(TOKEN_ID_SEPARATOR));
    const tokenOf = JSON.parse(scene.tokens) as EntryToken[];
    // Players see HP where the map's collection shows it to them
    const hpVisible = scene.remote || mapResources(AssetService.getInstance(this.app), scene.mapPath).some((definition) => definition.key === 'hp' && definition.visibleToPlayers);
    const list = playerInitiativeList(
      initiative,
      (entry, index) => (visibleTokenIds.has(entry.tokenId) ? tokenOf[index] ?? { hp: null, showRing: true, side: 'opponents' } : null),
      scene.remoteRules ?? mapInitiativeRules(this.app, scene.mapPath),
      hpVisible,
    );
    renderPlayerInitiative(container, list, {
      showNames: settings.showTokenNameplates,
      portraitSrc: (imagePath) => (/^(?:https?:|data:|blob:|app:)/.test(imagePath) ? imagePath : this.app.vault.adapter.getResourcePath(imagePath)),
    });
  }
}
