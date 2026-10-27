import type { GroundsKind } from '../../houseModel';

/** The pieces of a house's grounds this folder draws; read by `drawnKinds.ts`, so it imports no drawing. */
export const KINDS: readonly GroundsKind[] = ['garden', 'path', 'drive', 'hedge', 'boundary-wall', 'gate', 'porch', 'outbuilding', 'tree', 'garden-fountain'];
