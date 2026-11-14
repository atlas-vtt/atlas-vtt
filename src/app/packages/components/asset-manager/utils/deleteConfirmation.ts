import type { ConfirmDialogOptions } from '../../../../ui/confirmDialog';
import type { AnyAsset } from '../types';
import { describeTokenDeleteImpact, type TokenDeleteImpact } from './tokenDeleteImpact';
import { t } from '../../../../i18n';

/** How many names a deletion lists before it counts the rest. */
const NAMED_ITEMS = 3;

/** The first names of `assets`, then how many more there are. */
function namedItems(assets: AnyAsset[]): string[] {
  const named = assets.slice(0, NAMED_ITEMS).map((asset) => asset.name);
  const rest = assets.length - named.length;
  return rest > 0 ? [...named, t('am.delete.more', { count: rest })] : named;
}

/** What goes to the trash along with the assets themselves, by their kinds. */
function companions(assets: AnyAsset[]): string[] {
  const tokens = assets.filter((asset) => asset.type === 'tokens').length;
  const scenes = assets.filter((asset) => asset.type === 'scenes').length;
  return [
    ...(tokens > 0 ? [t('am.delete.tokenArt', { count: tokens })] : []),
    ...(scenes > 0 ? [t('am.delete.sceneMaps', { count: scenes })] : []),
  ];
}

/**
 * The confirmation of deleting `assets` from the asset manager: it names them (the first three and
 * how many more) and says what goes with them: token art, a scene's map and snapshots, and where
 * the tokens are used (`impact`).
 */
export function deleteConfirmation(assets: AnyAsset[], impact: TokenDeleteImpact | null): ConfirmDialogOptions {
  const [first] = assets;
  const single = assets.length === 1 && first !== undefined;
  return {
    title: single ? t('am.delete.titleOne', { name: first.name }) : t('am.delete.titleMany', { count: assets.length }),
    message: [
      t('am.delete.toTrash', { count: assets.length }),
      ...companions(assets),
      ...(impact ? describeTokenDeleteImpact(impact) : []),
    ],
    list: single ? undefined : namedItems(assets),
    icon: 'trash-2',
    confirmLabel: single ? t('common.delete') : t('am.manage.deleteItems', { count: assets.length }),
    destructive: true,
  };
}
