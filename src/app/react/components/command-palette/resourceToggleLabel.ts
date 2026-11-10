import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { shapeOf } from '../../../resources/visibleResources';
import { t } from '../../../i18n';

/** The label of a switch that shows or hides one resource: named by its shape, a bar or a wheel. */
export function resourceToggleLabel(definition: ResourceDefinition, slot: number): string {
  const key = shapeOf(slot) === 'bar' ? 'tokens.showResourceBars' : 'tokens.showResourceWheels';
  return t(key, { name: definition.name });
}
