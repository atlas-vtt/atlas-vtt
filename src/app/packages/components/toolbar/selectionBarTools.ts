import type { Annotation } from "../../../annotations/annotationTypes"
import { styledBy, type StyleField } from "./drawStyle"
import type { DrawToolId } from "./drawToolChoices"

/** The styles the bar under a selection offers, in its order, where every selected drawing or text has them: colour and size, then each kind's own. */
const STYLES: readonly (StyleField & DrawToolId)[] = ['color', 'size', 'font', 'look', 'icon', 'dash', 'ends', 'curved', 'fill', 'seeThrough']

/**
 * The groups of tools of the bar under a selection of drawings and texts: the styles every one
 * of them has (a text its font and look, a stamp its symbol, a line its dash, ends and curve),
 * then their order, then who sees them, where they lie and their lock, then Delete. So a text and
 * a stamp selected together offer what both have, and nothing that changes one of them alone.
 */
export function selectionBarTools(selected: readonly Annotation[]): readonly (readonly DrawToolId[])[] {
  if (selected.length === 0) return []
  const styles: readonly DrawToolId[] = STYLES.filter((field) => styledBy(field, selected).length === selected.length)
  const groups: readonly (readonly DrawToolId[])[] = [styles, ['front', 'back'], ['players', 'layer', 'lock'], ['delete']]
  return groups.filter((group) => group.length > 0)
}
