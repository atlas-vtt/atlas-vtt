import type { Plugin } from 'obsidian';
import { CampaignPlay } from '../campaigns/campaignPlay';
import type { CampaignPlayers } from '../campaigns/players/CampaignPlayers';
import { givenTokens } from '../campaigns/players/givenTokens';
import { KnownPlayerTokens } from '../characters/knownPlayerTokens';
import { setPlayerTokenSource } from '../characters/playerTokens';
import { AssetService } from '../services/AssetService';

/**
 * Tells the app which tokens are the players' whatever they hold themselves (`isPlayersToken`): the
 * library's player characters and what the players of the campaign this device plays were given.
 * It reads them again when the library, the played campaign or its players change, and knows the
 * library once its index is read.
 */
export function registerPlayerTokens(plugin: Plugin, players: CampaignPlayers, campaignsRead: Promise<void>): void {
  const { app } = plugin;
  const assets = AssetService.getInstance(app);
  const play = CampaignPlay.forApp(app);
  const known = new KnownPlayerTokens({
    library: () => assets.loadedTokenAssets(),
    given: () => {
      const campaignId = play.playing();
      return campaignId === null ? null : givenTokens(players.of(campaignId).players, players.assignments(campaignId));
    },
  });
  const changed = (): void => known.changed();
  setPlayerTokenSource(known);
  plugin.registerEvent(app.workspace.on('atlas-vtt:refresh-assets', changed));
  plugin.register(assets.onReconciled(changed));
  plugin.register(play.onChange(changed));
  plugin.register(players.onChange(changed));
  void campaignsRead.then(() => assets.initialize()).then(changed, () => undefined);
  plugin.register(() => setPlayerTokenSource(null));
}
