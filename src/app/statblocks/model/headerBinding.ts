/**
 * A part of the header pointed at another field of the template. A part finds
 * its field by meaning (`headerKey`), so a system that keeps its level under
 * a key of its own, and labels it so, gets that field shown as the level once
 * the part is renamed after it: the meaning moves to that field, the part's
 * former field goes where no block shows it, and a block that repeated the
 * field leaves the layout as any header duplicate does. Pure.
 */

import { bindsFieldType } from './blockCatalogue';
import { fieldByKey, labelToKey } from './fieldKeys';
import { removeField, updateField } from './fieldOps';
import { withoutHeaderDuplicates } from './headerDuplicates';
import { HEADER_PARTS, headerKey, headerParts } from './templateHeader';
import { HEADER_PART_IDS, type HeaderPartId, type StatblockTemplate, type TemplateField } from './templateTypes';

/** The field a label names, other than `except`: by its label, ignoring case, else by the key the label makes. */
export function fieldNamedBy(fields: readonly TemplateField[], label: string, except: string): TemplateField | undefined {
  const wanted = label.trim().toLowerCase();
  if (!wanted) return undefined;
  const others = fields.filter((field) => field.key !== except);
  return others.find((field) => field.label?.trim().toLowerCase() === wanted) ?? fieldByKey(others, labelToKey(label, []));
}

/**
 * The template with part `id` showing field `key`, or the very template where
 * it cannot: a part found by no meaning (the name, the token art), a field
 * another part shows, or one the part's block cannot show.
 */
export function bindHeaderPart(template: StatblockTemplate, id: HeaderPartId, key: string): StatblockTemplate {
  const meaning = HEADER_PARTS[id].meaning;
  const field = fieldByKey(template.fields, key);
  const part = headerParts(template).find((each) => each.id === id);
  if (!meaning || !field || !part || part.key === key) return template;
  if (HEADER_PART_IDS.some((other) => other !== id && headerKey(template.fields, other) === key)) return template;
  if (!bindsFieldType(part.block.type, field.type)) return template;

  let next = template;
  for (const each of template.fields) {
    if (each.meaning === meaning) next = updateField(next, each.key, { meaning: undefined });
  }
  next = updateField(next, key, { meaning });
  next = removeField(next, part.key);
  return withoutHeaderDuplicates(next);
}
