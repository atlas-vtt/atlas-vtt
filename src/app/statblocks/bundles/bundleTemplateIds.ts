/**
 * Where an import puts the statblock templates a bundle carries (§4.3), matched by template id
 * and never by path, and the template-id map for what it writes from the bundle. Pure.
 *
 * - A template the vault lacks comes in under its own id.
 * - The same template (by content) is reused.
 * - One the vault holds as the last import left it is updated in place, silently.
 * - One the vault changed (diverged) is never overwritten: the bundle's version comes in as a
 *   copy with a new id, and the bundle's own notes and roles are pointed at the copy.
 *
 * A template and the note beside it are one: they are compared, updated and copied together.
 */

import type { InstalledTemplate } from '../../services/collectionBundle/installRecord';
import type { StatblockRole } from '../model/roleTypes';
import { isValidTemplateId } from '../model/templateIds';
import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';
import { frontmatterBounds } from '../notes/frontmatterBounds';
import { TEMPLATE_KEY } from '../notes/statblockSource';
import type { PackedTemplate, VaultTemplate } from './bundleTemplates';

/** Bundle template id → the id the template has in this vault, where the two differ. */
export type TemplateIdMap = ReadonlyMap<TemplateId, TemplateId>;
export const NO_TEMPLATE_IDS: TemplateIdMap = new Map();

/**
 * - `new`: written under its id (the bundle's, or the copy a previous import made, which was deleted).
 * - `reuse`: the vault has the same template.
 * - `keep`: the bundle's version is the one installed last time, and the vault changed it since.
 * - `update`: the vault holds it as installed last time; the bundle's newer version replaces it.
 * - `copy`: the vault's own differs; the bundle's version comes in beside it with a new id.
 */
export type TemplateOutcome = 'new' | 'reuse' | 'keep' | 'update' | 'copy';

export interface PlannedTemplate {
  bundlePath: string;
  bundleId: TemplateId;
  /** The name of its file in the bundle. */
  name: string;
  /** Its id in this vault after the import. */
  localId: TemplateId;
  /** Where its file is, or will be, in this vault. */
  target: string;
  outcome: TemplateOutcome;
  /** Fingerprint of the vault's template the decision read; null when the vault had none. */
  mine: string | null;
  theirs: string;
  /** The file's text, for the templates the import writes. */
  text?: string | undefined;
  /** The note beside it, for the templates the import writes; null where the bundle's has none. */
  body?: string | null | undefined;
}

export interface TemplatePlanRules {
  /** A free path for a template file of this name; each path given out is taken. */
  place(name: string): string;
  /** A new template id made from a name. */
  newId(name: string): TemplateId;
}

type InstalledTemplates = Readonly<Record<string, InstalledTemplate>> | undefined;

/** What the install record says of a bundle template, when it is sound. */
function installedOf(installed: InstalledTemplates, bundleId: TemplateId): InstalledTemplate | undefined {
  const entry = installed && Object.hasOwn(installed, bundleId) ? installed[bundleId] : undefined;
  const sound = entry && typeof entry.localId === 'string' && isValidTemplateId(entry.localId) && !isBuiltInTemplateId(entry.localId);
  return sound ? entry : undefined;
}

/** The template's text under `id`: its own bytes under its own id. */
function textUnder(template: PackedTemplate, id: TemplateId): string {
  return id === template.id ? template.text : `${JSON.stringify({ ...template.json, id }, null, 2)}\n`;
}

/** Decides what becomes of each template the bundle carries. */
export function planTemplates(
  bundle: readonly PackedTemplate[],
  vault: ReadonlyMap<TemplateId, VaultTemplate>,
  installed: InstalledTemplates,
  rules: TemplatePlanRules,
): PlannedTemplate[] {
  const usedIds = new Set<TemplateId>(vault.keys());
  const freshId = (name: string): TemplateId => {
    let id = rules.newId(name);
    while (usedIds.has(id)) id = rules.newId(name);
    usedIds.add(id);
    return id;
  };
  return bundle.map((template): PlannedTemplate => {
    const base = { bundlePath: template.path, bundleId: template.id, name: template.name, theirs: template.fingerprint };
    const entry = installedOf(installed, template.id);
    const installedHere = entry ? vault.get(entry.localId) : undefined;
    // An installed copy that is gone leaves the bundle's id to compare by.
    const local = installedHere ?? vault.get(template.id);
    const record = installedHere ? entry : undefined;
    if (!local) {
      const localId = entry?.localId ?? template.id;
      usedIds.add(localId);
      return { ...base, localId, target: rules.place(template.name), outcome: 'new', mine: null, text: textUnder(template, localId), body: template.body };
    }
    const found = { ...base, localId: local.id, target: local.path, mine: local.fingerprint };
    if (local.fingerprint === template.fingerprint) return { ...found, outcome: 'reuse' };
    if (record?.source === template.fingerprint) return { ...found, outcome: 'keep' };
    if (record?.installed === local.fingerprint) return { ...found, outcome: 'update', text: textUnder(template, local.id), body: template.body };
    const copyId = freshId(template.name);
    return { ...base, localId: copyId, target: rules.place(template.name), outcome: 'copy', mine: null, text: textUnder(template, copyId), body: template.body };
  });
}

/** The template-id map of a plan: the templates whose id here differs from the bundle's. */
export function templateIdMap(planned: readonly PlannedTemplate[]): TemplateIdMap {
  return new Map(planned.flatMap((template): Array<[TemplateId, TemplateId]> =>
    (template.localId === template.bundleId ? [] : [[template.bundleId, template.localId]])));
}

/** What the install record keeps of each template: a kept one its earlier entry, the others what is installed now. */
export function installedTemplates(planned: readonly PlannedTemplate[], previous: InstalledTemplates): Record<string, InstalledTemplate> {
  return Object.fromEntries(planned.map((template): [string, InstalledTemplate] => {
    const earlier = template.outcome === 'keep' ? installedOf(previous, template.bundleId) : undefined;
    const entry = earlier
      ? { ...earlier, target: template.target }
      : { localId: template.localId, target: template.target, source: template.theirs, installed: template.theirs };
    return [template.bundleId, entry];
  }));
}

const KEY_LINE = new RegExp(`^${TEMPLATE_KEY}:([^\\r\\n]*)`, 'm');
/** A single-line value, plain or quoted, with an optional comment. */
const ONE_LINE_VALUE = /^([ \t]*)(["']?)([^\s"']+)\2(?:[ \t]+#.*|[ \t]*)$/;

/**
 * The note's text with its `atlas-template` naming the template's id in this vault, when the
 * map moves it; the text itself otherwise. Only a single-line value is rewritten, in place, so
 * the rest of the note keeps its bytes.
 */
export function rewriteNoteTemplate(text: string, ids: TemplateIdMap): string {
  if (ids.size === 0) return text;
  const bounds = frontmatterBounds(text);
  if (!bounds.exists) return text;
  const line = KEY_LINE.exec(text.slice(bounds.from, bounds.to));
  const value = line ? ONE_LINE_VALUE.exec(line[1]!) : null;
  const next = value ? ids.get(value[3]!) : undefined;
  if (!line || !value || next === undefined) return text;
  const start = bounds.from + line.index + TEMPLATE_KEY.length + 1 + value[1]!.length + value[2]!.length;
  return `${text.slice(0, start)}${next}${text.slice(start + value[3]!.length)}`;
}

interface TemplateSettings {
  statblockRoles?: readonly StatblockRole[] | undefined;
}

/** Settings whose roles start from the templates' ids in this vault. */
export function withRoleTemplates<T extends TemplateSettings>(settings: T, ids: TemplateIdMap): T {
  const roles = settings.statblockRoles;
  if (!roles?.some((role) => ids.has(role.templateId))) return settings;
  return { ...settings, statblockRoles: roles.map((role) => ({ ...role, templateId: ids.get(role.templateId) ?? role.templateId })) };
}

/** Settings whose roles name the templates' ids in this vault. */
export function withSettingsTemplates<T extends TemplateSettings>(settings: T, ids: TemplateIdMap): T {
  return withRoleTemplates(settings, ids);
}

/** A note the import keeps as the vault has it, which names a template whose bundle version arrives as a copy. */
export interface ReusedNote {
  path: string;
  name: string;
  /** The template it names now. */
  from: TemplateId;
  /** The copy of the bundle's version. */
  to: TemplateId;
}

/**
 * The notes among `notes` (the vault's, reused in place) that name a template whose bundle
 * version this import brings in as a copy. Offered once, when the copy is made: a later update
 * of the copy does not ask again.
 */
export function notesToSwitch(notes: ReadonlyArray<{ path: string; templateId: TemplateId | null }>, planned: readonly PlannedTemplate[]): ReusedNote[] {
  const copies = templateIdMap(planned.filter((template) => template.outcome === 'copy'));
  return notes.flatMap(({ path, templateId }): ReusedNote[] => {
    const to = templateId === null ? undefined : copies.get(templateId);
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    return to && templateId !== null ? [{ path, name, from: templateId, to }] : [];
  });
}
