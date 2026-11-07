/**
 * What Save does with the name typed (the template editor's save dialog):
 * the template's own name updates its file, another name saves a new
 * template and leaves the original as it is. A built-in is never updated,
 * and a template never saved takes its first name. `saveChoice` is pure;
 * `nameTakenIn` reads the templates it is given and the vault.
 */

import type { App } from 'obsidian';
import type { LibraryTemplate } from '../../../model/resolvedTypes';
import type { TemplateId } from '../../../model/templateTypes';
import { TEMPLATE_FOLDER, templateNameProblem, templateNameTakenAt, templatePathIn } from '../../../library/templatePaths';
import type { SessionSnapshot } from '../sessionTypes';
import { t } from '../../../../i18n';

export type SaveKind = 'update' | 'new';

/** What the dialog's primary button does with a name. */
export interface SaveRequest {
  kind: SaveKind;
  name: string;
}

export interface SaveChoice {
  kind: SaveKind;
  /** The primary button's label. */
  label: string;
  /** Why the name cannot be saved under; null while it can. */
  problem: string | null;
  /** The line under the name: what saving does. */
  hint: string | null;
}

/** What the choice reads of the template being saved. */
export type SaveSubject = Pick<SessionSnapshot, 'id' | 'name' | 'builtIn' | 'unsaved'>;

/** Whether another template already goes by a name. */
export type NameTaken = (name: string) => boolean;

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function saveChoice(subject: SaveSubject, typed: string, taken: NameTaken): SaveChoice {
  const name = typed.trim();
  const problem = templateNameProblem(name) ?? (taken(name) ? t('templateEditor.save.taken', { name }) : null);
  if (subject.unsaved) return { kind: 'new', label: t('templateEditor.save.save'), problem, hint: null };
  if (subject.builtIn) {
    const own = sameName(name, subject.name) ? t('templateEditor.save.builtInName') : null;
    return { kind: 'new', label: t('templateEditor.save.asNew'), problem: own ?? problem, hint: t('templateEditor.save.builtInHint', { name: subject.name }) };
  }
  if (sameName(name, subject.name)) return { kind: 'update', label: t('templateEditor.save.update'), problem: null, hint: t('templateEditor.save.updateHint') };
  return { kind: 'new', label: t('templateEditor.save.asNew'), problem, hint: t('templateEditor.save.staysHint', { name: subject.name }) };
}

/** `base`, else `base 2`, `base 3`, … : the first name no template goes by. */
export function freeName(base: string, taken: NameTaken): string {
  const stem = base.trim();
  let name = stem;
  for (let n = 2; taken(name); n++) name = `${stem} ${n}`;
  return name;
}

/**
 * Whether a template other than `except` goes by the name, built-ins included,
 * or a file of that name (or its note) stands where new templates are saved.
 */
export function nameTakenIn(templates: readonly LibraryTemplate[], except: TemplateId, app?: App): NameTaken {
  return (name) => templates.some((entry) => entry.template.id !== except && sameName(entry.name, name))
    || (app !== undefined && !templateNameProblem(name) && templateNameTakenAt(app, templatePathIn(TEMPLATE_FOLDER, name)));
}
