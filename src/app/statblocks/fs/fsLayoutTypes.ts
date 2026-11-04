/**
 * Fantasy Statblocks' layout format, mirrored structurally (FS is optional and
 * never imported). Layouts reach the converter from FS's settings or from a
 * file a user picked, so every value is read as untrusted: the types say what
 * FS writes, the converter checks what is there.
 */

import type { CommonItem, StatblockLayout } from '../../react/components/statblock/statblockTypes';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';

/** A block's dice settings (`CommonProps` in FS's `layout.types.ts`), which the renderer's types leave out. */
export interface FsDiceProps {
  dice?: boolean;
  /** The key whose dice a property rolls. */
  diceProperty?: string;
  diceText?: string;
  /** JavaScript that splits a value into text and dice. */
  diceCallback?: string;
}

/** One block of a layout; containers hold `nested`, an `ifelse` its `conditions`. */
export interface FsBlock extends Omit<CommonItem, 'nested' | 'conditions'>, FsDiceProps {
  nested?: FsBlock[];
  conditions?: FsBranch[];
}

/** A branch of an `ifelse`: JavaScript that decides, and the group shown when it is true (an empty last condition is "else"). */
export interface FsBranch {
  condition: string;
  nested: FsBlock[];
}

/** How a layout finds dice in text: a regular expression and JavaScript that reads a match. */
export interface FsDiceParsing {
  id: string;
  regex: string;
  parser: string;
  desc?: string;
}

export interface FsLayout extends Omit<StatblockLayout, 'blocks'> {
  blocks: FsBlock[];
  diceParsing?: FsDiceParsing[];
  /** Light and dark colour and font overrides. */
  cssProperties?: Record<string, unknown>;
}

/** Finds a layout a `layout` block includes, by the id FS stores there (or a name). */
export type FsLayoutResolver = (idOrName: string) => FsLayout | null;

export interface FsImportOptions {
  /** The new template's id (`newTemplateId`). */
  id: TemplateId;
  /** Where `layout` blocks find the layouts they include; without it they are left out. */
  resolveLayout?: FsLayoutResolver;
}

/** A `script` block the import made: FS JavaScript, kept for FS, which Atlas shows as the values it reads. */
export interface FsScriptNote {
  blockId: string;
  /** A phrase without a full stop: "Hit points and Stress tracks drawn with JavaScript". */
  summary: string;
  /** 'track': `suggestedTrackReplacement` has Track blocks that can stand in for it. */
  suggestion: 'track' | null;
}

export interface FsImportReport {
  /** FS blocks that became Atlas blocks, nested ones and those of included layouts among them. */
  blocks: number;
  fields: number;
  scripts: FsScriptNote[];
  /** What was not carried over, in plain sentences. */
  dropped: string[];
  /** What Atlas shows only in part, in plain sentences; the rest of those blocks is kept for export. */
  partial: string[];
  /** FS blocks without JavaScript (none inside a script either), and how many of them Atlas shows in full. */
  withoutCode: { total: number; full: number };
}

export interface FsImportResult {
  template: StatblockTemplate;
  report: FsImportReport;
}
