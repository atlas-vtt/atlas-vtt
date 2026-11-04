import type { App } from 'obsidian';
import { noteTemplateId, readBundleTemplates, templateFingerprintAt, vaultTemplates, type PackedTemplate } from '../../statblocks/bundles/bundleTemplates';
import { notesToSwitch, planTemplates, type PlannedTemplate, type ReusedNote } from '../../statblocks/bundles/bundleTemplateIds';
import { templateName } from '../../statblocks/library/templateFiles';
import { templateBodyPath, templateNameTakenAt } from '../../statblocks/library/templatePaths';
import { newTemplateId } from '../../statblocks/model/templateIds';
import type { TemplateId } from '../../statblocks/model/templateTypes';
import { switchTemplates } from '../../statblocks/notes/templateSwitch';
import { toBuffer } from './bundleContent';
import type { CollectionBundleManifest } from './bundleFormat';
import type { BundleFileReader } from './bundleReader';
import type { ImportJournal } from './importJournal';
import type { InstallRecord } from './installRecord';
import { templatePlacer } from './pathRemap';

/** The statblock templates of a bundle under review, and what the import does with each. */
export interface TemplateImport {
  /** The bundle's templates without code, which previews of its notes look up first. */
  bundle: readonly PackedTemplate[];
  planned: readonly PlannedTemplate[];
}

/** What the review shows of the templates. */
export interface TemplateReview {
  /** Templates whose bundle version comes in as a copy, since the vault's own differs. */
  copies: ReadonlyArray<{ name: string; copyName: string }>;
  /** The vault's notes the import keeps as they are that name one of those templates: the user may switch them to the copy. */
  reusedNotes: readonly ReusedNote[];
}

/**
 * Reads the bundle's templates and decides, by template id, what becomes of each
 * (`planTemplates`); new files go to the library folder (`templatePlacer`), a name another
 * file or note has taking `collectionName` in brackets, so the note beside a template never
 * lands on a note it did not write. The templates name the dice sets' ids here (`diceSetIds`).
 */
export async function planTemplateImport(
  app: App,
  manifest: CollectionBundleManifest,
  files: BundleFileReader,
  record: InstallRecord | null,
  collectionName: string,
  diceSetIds: ReadonlyMap<string, string> = new Map(),
): Promise<TemplateImport> {
  const bundle = await readBundleTemplates(manifest.files, (path) => files.text(path), diceSetIds);
  if (bundle.length === 0) return { bundle, planned: [] };
  const planned = planTemplates(bundle, await vaultTemplates(app), record?.templates, {
    place: templatePlacer(collectionName, (path) => templateNameTakenAt(app, path)),
    newId: (name) => newTemplateId(name),
  });
  return { bundle, planned };
}

/** The notes among `reused` (vault paths the import keeps as they are) that name a template whose bundle version comes in as a copy. */
export function reusedNotesOf(app: App, reused: Iterable<string>, planned: readonly PlannedTemplate[]): ReusedNote[] {
  const notes = [...reused].filter((path) => path.toLowerCase().endsWith('.md')).map((path) => ({ path, templateId: noteTemplateId(app, path) }));
  return notesToSwitch(notes, planned);
}

export function templateReview(planned: readonly PlannedTemplate[], reusedNotes: readonly ReusedNote[]): TemplateReview {
  const copies = planned.filter((template) => template.outcome === 'copy').map((template) => ({ name: template.name, copyName: templateName(template.target) }));
  return { copies, reusedNotes };
}

/**
 * Whether the vault's templates changed since the review: one the decision read differs now
 * (its note included), or a file took a path a new template or its note was to get.
 */
export async function templatesChangedSinceReview(app: App, planned: readonly PlannedTemplate[]): Promise<boolean> {
  for (const template of planned) {
    const changed = template.mine === null
      ? templateNameTakenAt(app, template.target)
      : await templateFingerprintAt(app, template.target) !== template.mine;
    if (changed) return true;
  }
  return false;
}

/**
 * Writes the templates the plan brings in or updates, each with the note beside it, through
 * the import's journal; an update whose version has no note removes the one it replaces.
 * Returns how many templates were written.
 */
export async function writeTemplates(journal: Pick<ImportJournal, 'write' | 'remove'>, planned: readonly PlannedTemplate[]): Promise<number> {
  let written = 0;
  for (const template of planned) {
    if (template.text === undefined) continue;
    await journal.write(template.target, toBuffer(template.text));
    const bodyPath = templateBodyPath(template.target);
    if (template.body) await journal.write(bodyPath, toBuffer(template.body));
    else if (template.outcome === 'update') await journal.remove(bodyPath);
    written += 1;
  }
  return written;
}

/** Switches the notes to the copies of their templates, one batch per copy; a note changed meanwhile keeps its template. Returns how many switched. */
export async function switchReusedNotes(app: App, notes: readonly ReusedNote[]): Promise<number> {
  const byCopy = new Map<TemplateId, ReusedNote[]>();
  for (const note of notes) byCopy.set(note.to, [...(byCopy.get(note.to) ?? []), note]);
  let switched = 0;
  for (const [copy, group] of byCopy) switched += (await switchTemplates(app, group, copy)).switched.length;
  return switched;
}
