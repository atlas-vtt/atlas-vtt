import { shownToPlayersOn, type SideHolder } from './playerAudience';
import { holdsValue } from './resourceValues';
import { slottedResources } from './resourceSlots';
import { BAR_SLOTS, type ResourceDefinition, type ResourceHolder, type ResourceShape, type ResourceViewer, type VisibleResource } from './resourceTypes';

/** The shape a resource takes on a token: its slot decides, never the resource. */
export function shapeOf(slot: number): ResourceShape {
  return slot < BAR_SLOTS ? 'bar' : 'wheel';
}

/**
 * The resources a viewer sees on a token, in socket order. The only place that filters them: players
 * at large see a resource on the tokens its audience names (`shownToPlayersOn`, by the token's side).
 */
export function visibleResources(
  token: ResourceHolder & SideHolder,
  definitions: readonly ResourceDefinition[],
  viewer: ResourceViewer,
): VisibleResource[] {
  const shown: VisibleResource[] = [];
  for (const { definition, slot } of slottedResources(definitions)) {
    if (viewer === 'player' && !shownToPlayersOn(definition, token)) continue;
    const value = token.resources?.[definition.key];
    if (!value || !holdsValue(definition, value)) continue;
    shown.push({ definition, value, slot });
  }
  return shown;
}
