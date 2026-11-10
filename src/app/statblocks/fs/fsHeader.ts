/**
 * A Fantasy Statblocks layout's name, image, type, level, hit points and
 * description as the header Atlas draws (`templateHeader.ts`). Each part takes
 * the layout's own key for it (FS's `cr` is the level), which keeps its key
 * and gets the part's meaning where it is not the part's own; a block that
 * shows that key and nothing else leaves the layout, since the header shows
 * it. A part the layout has no key for, or shows only inside a block with
 * other values ("{size} {type}, {alignment}"), is hidden, so nothing shows
 * twice. Where the layout's top heading shows another key than the name
 * (Cairn's `title`, "Aranea", where `name` is the bestiary's "Aranea
 * (Cairn)"), that key is the display name the header shows, and its heading
 * leaves the layout too. Pure.
 */

import { patternRefs } from '../expressions/patternRefs';
import { showsHeaderValue, withoutBlocks } from '../model/headerDuplicates';
import { HEADER_PARTS } from '../model/templateHeader';
import { fieldsShownBy, flattenReadingOrder } from '../model/treeQueries';
import {
  HEADER_PART_IDS, type FieldKey, type HeaderPartId, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from '../model/templateTypes';

/** The keys FS layouts keep each part under, the most usual first. */
const FS_KEYS: Readonly<Record<HeaderPartId, readonly FieldKey[]>> = {
  name: ['name'], token: ['image'], level: ['level', 'cr'], type: ['type'], hp: ['hp'], description: ['description'],
};

interface PartKey {
  part: HeaderPartId;
  key: FieldKey;
}

function partKeys(fields: readonly TemplateField[]): PartKey[] {
  return HEADER_PART_IDS.flatMap((part): PartKey[] => {
    const key = FS_KEYS[part].find((candidate) => fields.some((field) => field.key === candidate));
    return key ? [{ part, key }] : [];
  });
}

/** The field with the part's meaning where its key is not the part's own (FS's `cr` as the level). */
function withMeaning(field: TemplateField, part: HeaderPartId): TemplateField {
  const spec = HEADER_PARTS[part];
  if (!spec.meaning || field.key === spec.field.key || field.meaning) return field;
  return { ...field, meaning: spec.meaning };
}

/** The key the layout's top heading shows where that is not the name: the name the statblock goes by on its card. */
function displayNameOf(blocks: readonly TemplateBlock[], fields: readonly TemplateField[]): FieldKey | null {
  const top = flattenReadingOrder(blocks).find((block) => block.type === 'title');
  if (top?.type !== 'title' || top.level !== 1 || top.pattern !== undefined) return null;
  const key = top.field;
  return !FS_KEYS.name.includes(key) && fields.some((field) => field.key === key) ? key : null;
}

/** The imported template with its header: its parts' blocks out of the layout, unused parts hidden. */
export function withFsHeader(template: StatblockTemplate): StatblockTemplate {
  const keys = partKeys(template.fields);
  const display = displayNameOf(template.layout.blocks, template.fields);
  const all = flattenReadingOrder(template.layout.blocks);
  const moved = new Set<string>();
  for (const partKey of [...keys, ...(display ? [{ part: 'name' as const, key: display }] : [])]) {
    for (const block of all) if (showsHeaderValue(block, partKey.part, partKey.key, template.fields)) moved.add(block.id);
  }
  const blocks = withoutBlocks(template.layout.blocks, moved);
  const stillShown = new Set(flattenReadingOrder(blocks).flatMap((block) => fieldsShownBy(block, patternRefs)));
  const hidden = HEADER_PART_IDS.filter((part) => {
    if (!HEADER_PARTS[part].hideable) return false;
    const found = keys.find((entry) => entry.part === part);
    return !found || stillShown.has(found.key);
  });
  const partOf = new Map(keys.map(({ part, key }) => [key, part]));
  const fields = template.fields.map((field) => {
    if (field.key === display && !field.meaning) return { ...field, meaning: 'display-name' as const };
    const part = partOf.get(field.key);
    return part ? withMeaning(field, part) : field;
  });
  return {
    ...template,
    fields,
    ...(hidden.length > 0 && { header: { hidden } }),
    layout: { ...template.layout, blocks },
  };
}
