import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import { trackedResources } from '../../../resources/trackedResources';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import { withHeaderFields } from '../../../statblocks/model/templateHeader';
import { readerFor } from '../../../statblocks/values/fieldValues';
import { withReferencesFilled } from '../../../statblocks/values/fillReferences';
import { statblockLookup } from '../../../statblocks/values/statblockLookup';
import { trackedMax, trackedValue } from '../../../statblocks/values/trackedNumbers';
import { playerAccess, shownRecord } from './playerAccess.ts';
import { trackedMaxRoute } from './resourceMax.ts';

/** A tracked number of a character's statblock, as its sheet holds it. */
export interface TrackedSheetValue {
  readonly definition: ResourceDefinition;
  readonly value: ResourceValue;
  /** Whether its player may step it: only where the template lets them change its field. */
  readonly editable: boolean;
  /** Whether its player may set its maximum: only where it is a plain number of a field the template lets them change (`trackedMaxRoute`). */
  readonly maxEditable: boolean;
}

/**
 * The numbers a character's native statblock tracks that its player may see (with the field
 * their maximum is read from), each as a resource beside the collection's `definitions`, with the
 * note's maximum and the current value `held` (the token's), else where it starts. None for a
 * statblock not read yet or of no native template.
 */
export function trackedSheetValues(
  resolved: ResolvedStatblock | null | undefined,
  definitions: readonly ResourceDefinition[],
  held: Readonly<Record<string, ResourceValue>> | undefined,
): TrackedSheetValue[] {
  const template = resolved?.source.kind === 'atlas' ? resolved.template : null;
  if (!resolved || !template) return [];
  const { fields } = withHeaderFields(template);
  // Maximums as the card shows them, filled in from what the player may see alone
  const visible = shownRecord(resolved.fields, template, fields);
  const reader = readerFor(withReferencesFilled(visible, fields, statblockLookup(template, visible, fields)), fields);
  return trackedResources(template, definitions).flatMap(({ tracked, definition }): TrackedSheetValue[] => {
    // Its maximum shows too, so a field it reads that players may not see keeps it off their sheet
    if (playerAccess(template, tracked.field.key) === 'hidden' || playerAccess(template, tracked.maxField) === 'hidden') return [];
    const max = trackedMax(tracked, reader);
    const editable = playerAccess(template, tracked.field.key) === 'edit';
    const maxEditable = trackedMaxRoute(resolved, tracked) !== null;
    return max === null ? [] : [{ definition, value: trackedValue(tracked, max, held?.[definition.key]), editable, maxEditable }];
  });
}
