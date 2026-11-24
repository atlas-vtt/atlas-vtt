import { t } from '../../i18n';

/**
 * Named footprints offered in menus, stored as the multiplier `tokenDiameterInCells` expects.
 * Apart from `tokenSizing`, which the vision worker imports and which so stays free of texts.
 */
export const TOKEN_SIZE_OPTIONS: ReadonlyArray<{ label: string; size: number }> = [
  { label: t('token.size.tiny'), size: 0.75 },
  { label: t('token.size.small'), size: 0.875 },
  { label: t('token.size.medium'), size: 1 },
  { label: t('token.size.large'), size: 1.5 },
  { label: t('token.size.huge'), size: 2 },
  { label: t('token.size.gargantuan'), size: 2.5 },
];
