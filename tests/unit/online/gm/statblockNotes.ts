import type { PlacedTokenSource } from '../../../../src/app/characters/playerCharacters';
import { setStatblockGate, type StatblockWriteOutcome } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { ResolvedStatblock, TemplateStatus } from '../../../../src/app/statblocks/model/resolvedTypes';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock, type TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { frontmatterBounds } from '../../../../src/app/statblocks/notes/frontmatterBounds';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { readFrontmatterDoc } from '../../../../src/app/statblocks/notes/yamlDocument';

/*
 * Statblock notes as Atlas holds them, for tests of the players' statblocks: each note is its text,
 * and what Obsidian's metadata cache read of it. A write goes through Atlas's own patcher, so a
 * note's body and untouched lines stay as they were; the cache reads the new text when the test
 * says (`settle`), or at once.
 */

interface Note {
  text: string;
  fields: Record<string, unknown>;
  template: StatblockTemplate;
  status: TemplateStatus;
  kind: 'atlas' | 'fs-frontmatter';
}

/** A template of these fields and blocks, one column. */
export function templateOf(fields: TemplateField[], blocks: TemplateBlock[]): StatblockTemplate {
  return { format: TEMPLATE_FORMAT, version: 1, id: 'test-template-abc123', fields, layout: { maxColumns: 2, columnWidth: 22, blocks } };
}

/** The properties of a note's text as the cache reads them; null where its YAML cannot be read. */
export function propertiesOf(text: string): Record<string, unknown> | null {
  const bounds = frontmatterBounds(text);
  return bounds.exists ? readFrontmatterDoc(text.slice(bounds.from, bounds.to))?.model ?? null : {};
}

export class StatblockNotes {
  readonly notes = new Map<string, Note>();
  /** The statblock note each library token links, by its artwork. */
  readonly library = new Map<string, string>();
  readonly writes: { path: string; patches: readonly NotePatch[] }[] = [];
  /** Whether the cache reads a written note only once the test settles it. */
  lagging = false;
  private readonly listeners = new Set<(path: string | null) => void>();
  private readonly unread = new Set<string>();

  /** Makes this the gate the books read and write statblocks through. */
  install(): this {
    setStatblockGate({
      libraryStatblock: (placed: PlacedTokenSource) => this.library.get(placed.imagePath) ?? null,
      read: (path) => Promise.resolve(this.resolved(path)),
      write: (path, patches) => Promise.resolve(this.write(path, patches)),
      onChange: (listener) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
      },
    });
    return this;
  }

  /** A note of a template, with its text (frontmatter and body). */
  put(path: string, template: StatblockTemplate, text: string, options: { status?: TemplateStatus; kind?: Note['kind'] } = {}): void {
    this.notes.set(path, { text, fields: propertiesOf(text) ?? {}, template, status: options.status ?? 'ok', kind: options.kind ?? 'atlas' });
    this.tell(path);
  }

  /** The note's text is changed outside the books (the GM types in it); the cache reads it at once. */
  edit(path: string, text: string): void {
    const note = this.notes.get(path);
    if (note === undefined) throw new Error(`no note ${path}`);
    note.text = text;
    note.fields = propertiesOf(text) ?? note.fields;
    this.tell(path);
  }

  /** The note's text changes where the cache does not see it yet (a sync tool wrote it a moment ago, or its YAML has an error the cache reads past). */
  corrupt(path: string, text: string): void {
    const note = this.notes.get(path);
    if (note === undefined) throw new Error(`no note ${path}`);
    note.text = text;
  }

  /** The text of a note as written. */
  text(path: string): string {
    return this.notes.get(path)?.text ?? '';
  }

  /** The cache reads every note written since it last did. */
  settle(): void {
    for (const path of [...this.unread]) {
      const note = this.notes.get(path);
      if (note !== undefined) note.fields = propertiesOf(note.text) ?? note.fields;
      this.unread.delete(path);
      this.tell(path);
    }
  }

  /** Every note may read otherwise, as when a template is saved. */
  templatesChanged(): void {
    for (const listener of [...this.listeners]) listener(null);
  }

  private resolved(path: string): ResolvedStatblock | null {
    const note = this.notes.get(path);
    if (note === undefined) return null;
    const source = note.kind === 'atlas' ? { kind: 'atlas' as const, templateId: note.template.id } : { kind: 'fs-frontmatter' as const };
    return { path, source, fields: { ...note.fields }, template: note.template, templateStatus: note.status, lookName: 'Test', meanings: {} };
  }

  private write(path: string, patches: readonly NotePatch[]): StatblockWriteOutcome {
    this.writes.push({ path, patches });
    const note = this.notes.get(path);
    if (note === undefined) return { applied: [], conflicts: patches, problem: 'The note no longer exists.' };
    const result = applyFrontmatterPatches(note.text, patches);
    if (result.text === note.text) return { applied: result.applied, conflicts: result.conflicts, problem: null };
    note.text = result.text;
    if (this.lagging) this.unread.add(path);
    else {
      note.fields = propertiesOf(note.text) ?? note.fields;
      this.tell(path);
    }
    return { applied: result.applied, conflicts: result.conflicts, problem: null };
  }

  private tell(path: string): void {
    for (const listener of [...this.listeners]) listener(path);
  }
}
