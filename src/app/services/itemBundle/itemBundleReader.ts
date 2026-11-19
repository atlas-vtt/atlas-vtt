import { parseStoredDiceSet } from '../../gameSystems/diceSetValidation';
import { parseUserPreset } from '../../gameSystems/presetValidation';
import { cleanTemplate } from '../../statblocks/bundles/bundleTemplates';
import { DICE_SET_ROLE, type BundleFile } from '../collectionBundle/bundleFormat';
import type { BundleProgressListener } from '../collectionBundle/bundleProgress';
import { presetDiceSetId } from '../collectionBundle/bundlePresetFiles';
import { bundleFileReader, readBundleArchive, verifiedFileHashes, type BundleArchive, type BundleFileReader } from '../collectionBundle/bundleReader';
import { readRecordText } from '../vaultRecords/recordFolder';
import { itemFileOf, itemManifestProblem, type ItemBundleManifest } from './itemBundleFormat';
import { ITEM_RECORDS } from './vaultItems';
import { t } from '../../i18n';

/** An item bundle whose manifest is sound, whose files match their checksums and hold what the manifest says. */
export interface OpenedItemBundle {
  manifest: ItemBundleManifest;
  files: BundleFileReader;
}

const BUILT_IN_PREFIX = 'builtin:';

/** The id of the dice set the item file names, and null for an item that names none. */
type NamedDiceSet = string | null;

/** Why the item's own file does not hold what the manifest says, else the dice set it names. */
async function itemFileProblem(manifest: ItemBundleManifest, path: string, text: string): Promise<{ problem: string } | { diceSetId: NamedDiceSet }> {
  const { kind, id } = manifest.item;
  if (kind === 'statblock-template') {
    const template = await cleanTemplate(path, text);
    if (!template) return { problem: t('itemBundle.damaged') };
    if (template.id !== id) return { problem: t('itemBundle.damaged') };
    return { diceSetId: typeof template.json.diceSetId === 'string' ? template.json.diceSetId : null };
  }
  const entry = readRecordText(ITEM_RECORDS[kind].spec, text);
  const sound = kind === 'system-preset' ? parseUserPreset(entry) : parseStoredDiceSet(entry);
  if (!entry || !sound || entry.id !== id) return { problem: t('itemBundle.damaged') };
  return { diceSetId: kind === 'system-preset' ? presetDiceSetId(entry) ?? null : null };
}

/** Why the bundle's files do not hold what its manifest says, or null when they do. */
async function contentProblem(manifest: ItemBundleManifest, files: BundleFileReader): Promise<string | null> {
  if (manifest.item.id.startsWith(BUILT_IN_PREFIX)) return t('itemBundle.builtIn');
  const itemFile = itemFileOf(manifest);
  const text = await files.text(itemFile.vaultPath);
  if (text === null) return t('itemBundle.damaged');
  const read = await itemFileProblem(manifest, itemFile.vaultPath, text);
  if ('problem' in read) return read.problem;
  const diceSet: BundleFile | undefined = manifest.item.kind === 'dice-set' ? undefined : manifest.files.find((file) => file.role === DICE_SET_ROLE);
  if (!diceSet) return null;
  const set = parseStoredDiceSet(readRecordText(ITEM_RECORDS['dice-set'].spec, await files.text(diceSet.vaultPath) ?? ''));
  // A dice set travels only with the item that rolls it.
  return set && set.id === read.diceSetId ? null : t('itemBundle.damaged');
}

/** A read item bundle, checked: its manifest, every file's checksum, and what its files hold. */
export async function checkedItemBundle({ zip, manifest }: BundleArchive, onProgress: BundleProgressListener = () => undefined): Promise<OpenedItemBundle> {
  const problem = itemManifestProblem(manifest);
  if (problem) throw new Error(problem);
  const checked = manifest as ItemBundleManifest;
  await verifiedFileHashes(zip, checked.files, onProgress);
  const files = bundleFileReader({ zip });
  const content = await contentProblem(checked, files);
  if (content) throw new Error(content);
  return { manifest: checked, files };
}

/** Reads and checks an item bundle; throws, saying why, for anything that is not a sound one. */
export async function readItemBundle(data: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>, onProgress: BundleProgressListener = () => undefined): Promise<OpenedItemBundle> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/zip' });
  return checkedItemBundle(await readBundleArchive(blob, onProgress), onProgress);
}
