import type { Asset, CollectionMetadata } from '../AssetService';
import type { BundleKind, CollectionBundleManifest } from './bundleFormat';
import { groupContents, type ContentGroup } from './bundleContents';
import type { CollectionField, InstallRecord } from './installRecord';
import type { TemplateReview } from './importTemplates';
import { planHasChanges, type ChangeStatus, type ConflictReason, type ImportPlan } from './importPlan';
import { baseName } from '../../utils/pathUtils';
import { t } from '../../i18n';

/** How the bundle's version relates to the one in the vault. */
type ImportRelation = 'new' | 'newer' | 'same' | 'older';

export interface ReviewUnit {
  key: string;
  /** What it is, e.g. "Scene" or "Collection settings". */
  kind: string;
  name: string;
  reason: ConflictReason;
}

/** Everything the import dialog shows before the user decides. */
export interface ImportReview {
  collectionName: string;
  description?: string | undefined;
  /** The collection's cover image, when the bundle carries one. */
  cover?: Blob | undefined;
  /** The bundle's statblock templates that come in as copies, and the vault's notes that may switch to them. */
  templates?: TemplateReview | undefined;
  /** Name of the vault's copy, when it has one. */
  localName?: string | undefined;
  author?: string | undefined;
  version: number;
  installedVersion?: number | undefined;
  relation: ImportRelation;
  kind: BundleKind;
  releaseNotes?: string | undefined;
  exportedAt: number;
  /** False for copies imported before Atlas recorded installs: every difference is then a conflict. */
  hasInstallRecord: boolean;
  /**
   * The bundle claims to be a release of this collection by another publisher:
   * `own-collection` when this vault published it, `other-publisher` otherwise.
   */
  publisherWarning?: 'own-collection' | 'other-publisher' | undefined;
  /** Assets left out because they refer to files outside Atlas's folder. */
  skippedAssets: Array<{ name: string; path: string }>;
  /** A new collection whose name another collection already uses. */
  suggestedName?: string | undefined;
  counts: Record<ChangeStatus, number>;
  conflicts: ReviewUnit[];
  /** The vault already has this version and nothing differs that it would change or ask about. */
  upToDate: boolean;
  /** Whether "restore original" would change anything the normal import keeps. */
  canRestore: boolean;
  /** What the bundle holds, without the assets it leaves out. */
  contents: ContentGroup[];
  fileCount: number;
}

const ASSET_KINDS: Record<Asset['type'], string> = {
  token: t('review.kind.token'), map: t('review.kind.map'), note: t('review.kind.note'), statblock: t('review.kind.statblock'),
  character: t('review.kind.character'), scene: t('review.kind.scene'), encounter: t('review.kind.encounter'), player: t('review.kind.player'),
};

const FIELD_NAMES: Record<CollectionField, string> = {
  name: t('review.field.name'), description: t('review.field.description'), tags: t('review.field.tags'), settings: t('review.field.settings'),
};

function describeUnit(key: string, unitAssets: ReadonlyMap<string, Asset>): Pick<ReviewUnit, 'kind' | 'name'> {
  const asset = unitAssets.get(key);
  if (asset) return { kind: ASSET_KINDS[asset.type] ?? t('review.kind.asset'), name: asset.name };
  if (key.startsWith('field:')) return { kind: t('review.kind.collection'), name: FIELD_NAMES[key.slice('field:'.length) as CollectionField] ?? key };
  return { kind: t('review.kind.file'), name: baseName(key.slice(key.indexOf(':') + 1)) };
}

function relationOf(version: number, installedVersion: number | undefined): ImportRelation {
  if (installedVersion === undefined) return 'new';
  if (version > installedVersion) return 'newer';
  return version === installedVersion ? 'same' : 'older';
}

/**
 * Flags bundles that cannot come from the publisher of the vault's copy. Only
 * this vault releases its own collections, so anything newer than its last
 * release is foreign whatever the bundle claims. Other collections are flagged
 * when a release names a different publisher. Without signatures this guards
 * against mix-ups, not against deliberate forgery.
 */
function publisherWarning(manifest: CollectionBundleManifest, existing: CollectionMetadata | null, vaultId: string | null): ImportReview['publisherWarning'] {
  if (!existing?.publisherId) return undefined;
  if (existing.publisherId === vaultId) return manifest.collection.version > existing.version ? 'own-collection' : undefined;
  const claimed = manifest.collection.publisherId;
  return manifest.release?.kind !== 'share' && claimed && claimed !== existing.publisherId ? 'other-publisher' : undefined;
}

export function buildReview(
  manifest: CollectionBundleManifest,
  /** Null while this vault has published nothing. */
  vaultId: string | null,
  existing: CollectionMetadata | null,
  record: InstallRecord | null,
  plan: ImportPlan,
  restorePlan: ImportPlan,
  unitAssets: ReadonlyMap<string, Asset>,
  suggestedName: string | undefined,
  skipped: ReadonlyArray<{ bundleId: string; name: string; path: string }>,
): ImportReview {
  const { collection } = manifest;
  const installedVersion = existing ? record?.version ?? existing.version : undefined;
  const conflicts = plan.units.flatMap((unit): ReviewUnit[] =>
    unit.conflict ? [{ key: unit.key, ...describeUnit(unit.key, unitAssets), reason: unit.conflict }] : []);
  const relation = relationOf(collection.version, installedVersion);
  const skippedIds = new Set(skipped.map((asset) => asset.bundleId));
  return {
    collectionName: collection.name,
    description: collection.description,
    localName: existing?.name,
    author: collection.author,
    version: collection.version,
    installedVersion,
    relation,
    kind: manifest.release?.kind ?? 'release',
    releaseNotes: manifest.release?.notes,
    exportedAt: manifest.exportedAt,
    hasInstallRecord: record !== null,
    publisherWarning: publisherWarning(manifest, existing, vaultId),
    skippedAssets: skipped.map(({ name, path }) => ({ name, path })),
    suggestedName,
    counts: plan.counts,
    conflicts,
    upToDate: relation === 'same' && conflicts.length === 0 && !planHasChanges(plan),
    canRestore: existing !== null && restorePlan.counts.restored > 0,
    contents: groupContents(manifest.assets.filter((asset) => !skippedIds.has(asset.id)), manifest.files),
    fileCount: manifest.files.length,
  };
}
