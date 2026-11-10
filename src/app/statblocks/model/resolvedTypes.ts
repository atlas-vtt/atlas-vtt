import type { FieldKey, FieldMeaning, StatblockTemplate, TemplateId } from './templateTypes';

/** Where a note's statblock comes from: the one answer to "is this note a statblock?" */
export type StatblockSource =
  | { kind: 'atlas'; templateId: TemplateId }               // atlas-template in frontmatter
  | { kind: 'fs-frontmatter' }                               // statblock: true | "true", no atlas-template
  | { kind: 'fs-fence'; params: Record<string, unknown> };   // statblock: inline, or a ```statblock fence

/** How a template was found for a native note. */
export type TemplateStatus = 'ok' | 'missing' | 'newer' | 'auto';

/** A template as the library holds it, with what reading it found. */
export interface LibraryTemplate {
  template: StatblockTemplate;
  name: string;
  /** 'newer' templates are read-only: made with a newer Atlas. */
  status: 'ok' | 'newer';
  builtIn: boolean;
  /** Vault path of the file; null for built-ins. */
  path: string | null;
}

/** What the resolver needs to find templates; the library implements it. */
export interface TemplateLookup {
  get(id: TemplateId): LibraryTemplate | null;
}

export interface ResolveContext {
  templates: TemplateLookup;
}

export interface ResolvedStatblock {
  path: string;
  source: StatblockSource;
  /** Every field as consumers read them today; for native notes former keys are aliased to current keys. */
  fields: Readonly<Record<string, unknown>>;
  /** The template the note renders with: its own, the auto template, or null for FS statblocks while FS is loaded. */
  template: StatblockTemplate | null;
  templateStatus: TemplateStatus | null;
  /** The template's or FS layout's name; the creature filters' "Template" facet shows it. */
  lookName: string | null;
  /** Keys of the template's fields that carry a meaning. */
  meanings: Readonly<Partial<Record<FieldMeaning, FieldKey>>>;
  /**
   * A native note's fields as its card shows them, where they differ from `fields`: `@` references
   * filled in, a Number field written as a sum its total. Read numbers through `shownFieldsOf`;
   * whatever writes the note, or names a base for a write, reads `fields`.
   */
  shownFields?: Readonly<Record<string, unknown>>;
}

/** The fields to read numbers and words from: as the card shows them (`shownFields`), else as written. */
export function shownFieldsOf(statblock: Pick<ResolvedStatblock, 'fields' | 'shownFields'>): Readonly<Record<string, unknown>> {
  return statblock.shownFields ?? statblock.fields;
}
