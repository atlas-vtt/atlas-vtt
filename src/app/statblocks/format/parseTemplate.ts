/**
 * Reads a template file. Never throws: a file that is no template at all is
 * `invalid`, one claiming a built-in's id is `reserved` (disk can never shadow
 * a built-in), one of a newer format is `newer` and opens read-only. Anything
 * else is read as far as it can be: what cannot be used is reported in
 * `problems`, and what is not understood is kept for writing back.
 */

import {
  TEMPLATE_FORMAT,
  TEMPLATE_VERSION,
  isBuiltInTemplateId,
  type StatblockTemplate,
  type TemplateLayout,
} from '../model/templateTypes';
import { isValidTemplateId } from '../model/templateIds';
import { BlockIdAllocator } from './blockIds';
import { danglingFieldProblems } from './fieldReferences';
import { TEMPLATE_KEYS } from './formatKeys';
import { describeValue, isRecord, own, parseJsonText } from './jsonValues';
import { ObjectReader } from './objectReader';
import { parseLayout, type BlockContext } from './parseBlocks';
import { parseField } from './parseFields';
import { readDerivedFrom, readHeader, readImportedFrom, readLookups, readPlayers, readSource } from './parseTemplateMeta';
import { JSON_OBJECT, asJsonRecord, asKey, asPositiveInteger, asString } from './valueReads';

export type TemplateParseStatus = 'ok' | 'invalid' | 'newer' | 'reserved';

export interface TemplateParseResult {
  /** Null when the status is `invalid` or `reserved`. */
  template: StatblockTemplate | null;
  status: TemplateParseStatus;
  /** Plain sentences, in file order; an `ok` template may have some (it was read around them). */
  problems: string[];
}

export interface ParseTemplateOptions {
  /** Accept `builtin:` ids: only for the templates Atlas defines in code, never for files. */
  allowBuiltIn?: boolean;
}


/** Reads a template from its file text, or from a value already parsed (built-ins, bundles). */
export function parseTemplate(input: unknown, options: ParseTemplateOptions = {}): TemplateParseResult {
  const problems: string[] = [];
  try {
    return readTemplate(input, options.allowBuiltIn === true, problems);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'an unexpected error';
    return { template: null, status: 'invalid', problems: [...problems, `The template could not be read: ${reason}.`] };
  }
}

function invalid(problem: string): TemplateParseResult {
  return { template: null, status: 'invalid', problems: [problem] };
}

function readTemplate(input: unknown, allowBuiltIn: boolean, problems: string[]): TemplateParseResult {
  const parsed = typeof input === 'string' ? parseJsonText(input) : { value: input };
  if ('error' in parsed) return invalid(`The file is not valid JSON: ${parsed.error}.`);
  const file = parsed.value;
  if (!isRecord(file)) return invalid(`The file holds ${describeValue(file)}, not a template.`);
  const format = own(file, 'format');
  if (format !== TEMPLATE_FORMAT) {
    return invalid(`The file is not an Atlas statblock template: its "format" is ${describeValue(format)}.`);
  }
  const version = asPositiveInteger(own(file, 'version'));
  if (version === undefined) {
    return invalid(`The template's "version" is ${describeValue(own(file, 'version'))}, not a whole number above 0.`);
  }
  const id = own(file, 'id');
  if (typeof id === 'string' && isBuiltInTemplateId(id) && !allowBuiltIn) {
    return {
      template: null,
      status: 'reserved',
      problems: [`The id ${describeValue(id)} belongs to a template built into Atlas; a file cannot replace it.`],
    };
  }
  if (typeof id !== 'string' || !isValidTemplateId(id)) {
    return invalid(`The template's "id" is ${describeValue(id)}, which is not a template id.`);
  }
  const template = readBody(file, version, id, problems);
  return { template, status: version > TEMPLATE_VERSION ? 'newer' : 'ok', problems };
}

function emptyLayout(): TemplateLayout {
  return { maxColumns: 2, blocks: [] };
}

function readBody(file: Record<string, unknown>, version: number, id: string, problems: string[]): StatblockTemplate {
  const r = new ObjectReader(file, 'The template', problems, TEMPLATE_KEYS);
  if (r.rawValue('fields') === undefined) r.report('it has no "fields"; it reads as having none');
  const fieldContext = { problems, keys: new Set<string>() };
  const fields = r.requiredList('fields', (item, index) => parseField(item, index, fieldContext), null);

  if (r.rawValue('layout') === undefined) r.report('it has no "layout"; it reads as an empty one');
  const blockContext: BlockContext = { problems, ids: new BlockIdAllocator(problems) };
  const layout = r.withDefault('layout', (value) => parseLayout(value, blockContext), emptyLayout(), 'an object');
  blockContext.ids.assign();

  const template = r.finish<StatblockTemplate>({
    format: TEMPLATE_FORMAT,
    version,
    id,
    ...r.opt('description', asString, 'text'),
    ...r.optList('suits', asString, 'role names'),
    ...r.opt('diceSetId', asKey, 'a dice set id'),
    ...r.opt('derivedFrom', (value) => readDerivedFrom(value, problems), 'a template id with its revision'),
    ...r.opt('source', (value) => readSource(value, problems), 'a complete source'),
    ...r.opt('importedFrom', (value) => readImportedFrom(value, problems), 'a layout id and name'),
    fields,
    ...r.opt('header', (value) => readHeader(value, problems), 'an object'),
    layout,
    ...readPlayers(r),
    ...readLookups(r),
    ...r.opt('sample', asJsonRecord, JSON_OBJECT),
  });
  problems.push(...danglingFieldProblems(template));
  return template;
}
