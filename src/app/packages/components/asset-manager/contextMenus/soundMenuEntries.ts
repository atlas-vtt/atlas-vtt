import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import { t } from '../../../../i18n';
import type { SoundKind, SoundLicence } from '../../../../sound/soundTypes';
import { clampTrim, MAX_TRIM_DB, updateSounds, type SoundChanges } from '../../../../soundLibrary/soundRecords';
import { runInBackground } from '../../../../utils/backgroundTask';
import type { AnyAsset, SoundAsset } from '../types';
import type { AssetContextMenuDeps } from './assetContextMenu';

const KINDS: ReadonlyArray<{ kind: SoundKind; label: string }> = [
  { kind: 'music', label: t('audio.kind.music') },
  { kind: 'ambience', label: t('audio.kind.ambience') },
];

const LICENCES: ReadonlyArray<{ licence: SoundLicence; label: string }> = [
  { licence: 'unknown', label: t('audio.licence.unknown') },
  { licence: 'cc0', label: t('audio.licence.cc0') },
  { licence: 'cc-by', label: t('audio.licence.ccBy') },
  { licence: 'other', label: t('audio.licence.other') },
];

const signed = (db: number): string => (db > 0 ? `+${db}` : String(db));

/** The menu rows of a sound: its kind, trim, licence and credit, for every sound selected. */
export function soundMenuEntries(asset: AnyAsset, selectedAssets: readonly AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  const { assetService } = deps;
  if (asset.type !== 'sounds' || !assetService) return [];
  const sounds = selectedAssets.filter((selected): selected is SoundAsset => selected.type === 'sounds');
  const ids = sounds.map((sound) => sound.id);
  const change = (changes: SoundChanges): void => {
    runInBackground(updateSounds(assetService, ids, changes).then(() => deps.loadAssetsForActiveTab()), 'Changing sounds');
  };
  const trim = asset.record.trimDb ?? 0;
  const setTrim = (db: number): void => change({ trimDb: db === 0 ? undefined : clampTrim(db) });

  return [
    {
      type: 'submenu',
      label: t('audio.kind'),
      icon: 'music',
      children: KINDS.map(({ kind, label }) => ({
        type: 'item' as const,
        label,
        checked: asset.record.kind === kind,
        onClick: () => change({ kind }),
      })),
    },
    {
      type: 'item',
      label: t('audio.trim'),
      icon: 'volume-2',
      keepOpen: true,
      onClick: () => undefined,
      stepper: {
        value: t('audio.trimValue', { value: signed(trim) }),
        label: t('audio.trim'),
        onDecrement: () => setTrim(trim - 1),
        onIncrement: () => setTrim(trim + 1),
        canDecrement: trim > -MAX_TRIM_DB,
      },
    },
    {
      type: 'submenu',
      label: t('audio.licence'),
      icon: 'scale',
      children: LICENCES.map(({ licence, label }) => ({
        type: 'item' as const,
        label,
        checked: asset.record.licence === licence,
        onClick: () => change({ licence }),
      })),
    },
    {
      type: 'item',
      label: t('audio.credit'),
      icon: 'quote',
      onClick: () => deps.setInputModalState({
        isOpen: true,
        title: t('audio.creditTitle', { name: asset.name }),
        placeholder: t('audio.creditPlaceholder'),
        defaultValue: asset.record.credit ?? '',
        onConfirm: (credit: string) => change({ credit: credit.trim() || undefined }),
      }),
    },
  ];
}
