import type { EmbedContext, TFile } from 'obsidian';
import { AssetService } from '../services/AssetService';
import { addArtIcon, AtlasLinkEmbed, type EmbedCardContent } from './AtlasLinkEmbed';
import { encounterOfFile } from './atlasLinkAssets';
import { placeEncounterFile } from './openAtlasLink';
import { formatServiceAsset, tokenPreviewSources } from '../packages/components/asset-manager/utils/assetFormatters';
import type { EncounterTokenPreview } from '../packages/components/asset-manager/types';
import { createTokenPortrait } from '../packages/components/shared/tokenPortraitElement';
import { t } from '../i18n';

const ENCOUNTER_ICON = 'swords';

/** The encounter's tokens side by side, as many as its asset manager card shows, and how many more it holds. */
function addTokenRow(artEl: HTMLElement, previews: readonly EncounterTokenPreview[], tokenCount: number): void {
  if (previews.length === 0) {
    addArtIcon(artEl, ENCOUNTER_ICON);
    return;
  }
  const row = artEl.createDiv({ cls: 'atlas-link-embed__tokens' });
  for (const preview of previews) {
    createTokenPortrait(row, {
      src: preview.url,
      alt: '',
      showRing: preview.showRing ?? true,
      ringColor: preview.ringColor,
      cls: 'atlas-link-embed__token',
    });
  }
  const overflow = tokenCount - previews.length;
  if (overflow > 0) row.createDiv({ cls: 'atlas-link-embed__overflow', text: `+${overflow}` });
}

/** An embedded encounter (`![[…/encounters/encounter-….json|Goblin ambush]]`). */
export class EncounterEmbed extends AtlasLinkEmbed {
  constructor(ctx: EmbedContext, file: TFile, subpath: string) {
    super(ctx, file, subpath);
    // A strip of tokens, not a picture: set before loading so the card keeps its height
    this.artEl.addClass('atlas-link-embed__art--tokens');
  }

  protected async content(): Promise<EmbedCardContent> {
    const { app } = this.ctx;
    const assets = AssetService.getInstance(app);
    const encounter = await encounterOfFile(assets, this.file.path);
    const shown = encounter ? formatServiceAsset(encounter, '', app, tokenPreviewSources(await assets.getTokenAssets())) : null;
    const tokens = shown?.type === 'encounters' ? shown : null;
    const tokenCount = tokens?.tokens.length ?? 0;

    return {
      title: encounter?.name ?? this.file.basename,
      meta: encounter
        ? `${t('atlasLinks.tokenCount', { count: tokenCount })} · ${encounter.collection}`
        : t('atlasLinks.encounterMissing'),
      art: (artEl) => addTokenRow(artEl, tokens?.tokenPreviews ?? [], tokenCount),
      action: {
        label: t('atlasLinks.placeOnMap'),
        icon: 'map-pin',
        run: () => placeEncounterFile(app, this.file),
        failure: t('atlasLinks.placeFailed'),
      },
      more: encounter === null ? [] : [
        { label: t('atlasLinks.startFight'), icon: 'swords', run: () => placeEncounterFile(app, this.file, 'fight'), failure: t('atlasLinks.placeFailed') },
        { label: t('atlasLinks.addBeside'), icon: 'list-plus', run: () => placeEncounterFile(app, this.file, 'beside'), failure: t('atlasLinks.placeFailed') },
      ],
    };
  }
}
