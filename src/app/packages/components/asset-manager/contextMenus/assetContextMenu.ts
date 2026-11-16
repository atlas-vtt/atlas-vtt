import { App as ObsidianApp } from 'obsidian';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type {
  AnyAsset,
  EncounterAsset,
  CollectionOption,
  Folder,
  InputModalState,
  Tag as TagType,
  TokenAsset,
} from '../types';
import type { SpawnContext } from '../utils/tokenSpawnService';
import { spawnMenuEntries } from './spawnMenuEntries';
import type { AssetTagChange } from '../utils/assetTags';
import { runInBackground } from '../../../../utils/backgroundTask';
import type { AtlasView } from '../../../../atlas-view';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';
import { sceneMenuEntries } from './sceneMenuEntries';
import { openScene } from '../hooks/useOpenAsset';
import { assetEditEntries } from './assetEditEntries';
import { assetOrganiseEntries } from './assetOrganiseEntries';
import { deleteAssetsEntry, type DeleteAssetsDeps } from './deleteAssetsEntry';
import { alignedEntries } from '../../../../statblocks/editor/interaction/surfaceActions';
import { formatHotkey } from '../../../../keyboard/mapHotkeys';
import { t } from '../../../../i18n';
import { diceRandom } from '../../../../services/offlineDiceInputs';

export interface AssetContextMenuDeps extends DeleteAssetsDeps {
  view: AtlasView | null;
  onClose: () => void;
  // State setters
  setEditingToken: (asset: AnyAsset | null) => void;
  setIsTokenCreatorOpen: (open: boolean) => void;
  /** Opens the encounter builder on a saved encounter. */
  editEncounter: (encounter: EncounterAsset) => void;
  setIsMoveModalOpen: (open: boolean) => void;
  /** The tab files its assets in folders: the menu offers Move to folder, folders or not (its dialog makes the first). */
  canMoveToFolder: boolean;
  openCreateScene: (prefill: CreateScenePrefill) => void;
  setInputModalState: (state: InputModalState) => void;
  handleCreateTag: (tag: string) => Promise<TagType | null>;
  setTagsOfAssets: (changes: AssetTagChange[]) => Promise<void>;
  handleSaveAsEncounter: (tokenAssets: AnyAsset[]) => Promise<void>;
  /** Opens a token's statblock note; a note that is gone opens the dialog to link another. */
  openStatblock: (asset: TokenAsset) => void;
  openStatblockLinkModal: (asset: AnyAsset) => void;
  unlinkStatblock: (asset: AnyAsset) => Promise<void>;
  /** Opens the dialog that moves or copies `assets` to the collection the GM picks there. */
  pickCollection: (assets: AnyAsset[], mode: TransferMode) => void;
  // Data
  app: ObsidianApp;
  selectedAssetIds: string[];
  assets: AnyAsset[];
  folders: Folder[];
  availableTags: TagType[];
  /** Collections the assets can be moved or copied to. */
  transferTargets: CollectionOption[];
  /** The collection shown, whose roles a new statblock is made with. */
  collectionId: string;
}

/**
 * The menu's first group: what brings the asset into play (spawn, place, open a scene, make one
 * from a map). Its first row is what Enter and a double click on the card do, and says so.
 */
function playEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  const spawnCtx: SpawnContext = { app: deps.app, view: deps.view, assetService: deps.assetService, random: diceRandom };
  const entries: ContextMenuEntry[] = [...sceneMenuEntries(asset, selectedAssets, deps)];
  if (asset.type === 'scenes' && selectedAssets.length === 1) {
    entries.push({
      type: 'item',
      label: t('am.menu.openScene'),
      icon: 'play',
      onClick: () => runInBackground(openScene(deps, asset.id), `Opening scene ${asset.id}`, t('am.menu.openSceneFailed')),
    });
  }
  entries.push(...spawnMenuEntries(asset, selectedAssets, spawnCtx, deps.onClose));
  if (asset.type === 'tokens' && selectedAssets.length > 1) {
    const tokenAssets = selectedAssets.filter((a) => a.type === 'tokens');
    entries.push({
      type: 'item',
      label: t('am.menu.saveAsEncounter', { count: tokenAssets.length }),
      icon: 'target',
      onClick: () => deps.handleSaveAsEncounter(tokenAssets),
    });
  }
  const [main, ...rest] = entries;
  return main?.type === 'item' && selectedAssets.length <= 1 ? [{ ...main, detail: formatHotkey('Enter') }, ...rest] : entries;
}

/** Groups of rows with a line between each two that hold any. */
function grouped(groups: ContextMenuEntry[][]): ContextMenuEntry[] {
  return groups.filter((group) => group.length > 0).flatMap((group, index) => (index > 0 ? [MENU_SEPARATOR, ...group] : group));
}

/**
 * The menu of an asset card (or of the selection it belongs to), in four groups: bring it into
 * play, change it, file it, delete it. Every row has an icon slot, so all labels start on one edge.
 */
export function buildAssetContextMenuEntries(
  asset: AnyAsset,
  selectedAssets: AnyAsset[],
  deps: AssetContextMenuDeps
): ContextMenuEntry[] {
  return alignedEntries(grouped([
    playEntries(asset, selectedAssets, deps),
    assetEditEntries(asset, selectedAssets, deps),
    assetOrganiseEntries(asset, selectedAssets, deps),
    [deleteAssetsEntry(selectedAssets, deps)],
  ]));
}
