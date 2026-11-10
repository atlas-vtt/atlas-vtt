import { holdsValue } from './resourceValues';
import { slottedResources } from './resourceSlots';
import { BAR_SLOTS, type ResourceDefinition, type ResourceHolder, type ResourceShape, type ResourceViewer, type VisibleResource } from './resourceTypes';

/** The shape a resource takes on a token: its slot decides, never the resource. */
export function shapeOf(slot: number): ResourceShape {
  return slot < BAR_SLOTS ? 'bar' : 'wheel';
}

/** The resources a viewer sees on a token, in socket order. The only place that filters them. */
export function visibleResources(
  token: ResourceHolder,
  definitions: readonly ResourceDefinition[],
  viewer: ResourceViewer,
): VisibleResource[] {
  const shown: VisibleResource[] = [];
  for (const { definition, slot } of slottedResources(definitions)) {
    if (viewer === 'player' && !definition.visibleToPlayers) continue;
    const value = token.resources?.[definition.key];
    if (!value || !holdsValue(definition, value)) continue;
    shown.push({ definition, value, slot });
  }
  return shown;
}
