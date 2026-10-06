import { t } from '../../../../i18n';
import { RESOURCE_COLORS } from '../../../../resources/resourceColors';
import { draftResourceKey, isDraftResourceKey } from '../../../../resources/resourceDefinitions';
import { slottedResources } from '../../../../resources/resourceSlots';
import { MAX_RESOURCES, type ResourceDefinition } from '../../../../resources/resourceTypes';

/** Where a socket sits in the editor's picture of a token, in px from the token's centre. */
export interface SocketPlace {
  slot: number;
  shape: 'bar' | 'wheel';
  /** Centre of the socket. */
  x: number;
  y: number;
  /** Where its fan of buttons grows from, and to which side. */
  fanX: number;
  fanSide: 'right' | 'left';
  /** What the socket is, for its name. */
  where: string;
  /** What the socket is and when it shows, as the card's heading. */
  heading: string;
}

const BAR = { width: 150, height: 20 } as const;
const WHEEL_SIZE = 44;
/** Distance of the fan's buttons from the socket, and the angle between two of them. */
const FAN_RADIUS = 66;
const FAN_SPREAD_DEG = 34;

const BAR_TEXT = { where: t('resource.socket.bar'), heading: t('resource.socket.barHeading') };
const RIGHT_TEXT = { where: t('resource.socket.wheelRight'), heading: t('resource.socket.wheelRightHeading') };
const LEFT_TEXT = { where: t('resource.socket.wheelLeft'), heading: t('resource.socket.wheelLeftHeading') };

/** The six sockets, in slot order: two bars below the token, two wheels on its right, two on its left; the upper one first. */
export const SOCKETS: readonly SocketPlace[] = [
  { slot: 0, shape: 'bar', x: 0, y: 92, fanX: BAR.width / 2, fanSide: 'right', ...BAR_TEXT },
  { slot: 1, shape: 'bar', x: 0, y: 118, fanX: BAR.width / 2, fanSide: 'right', ...BAR_TEXT },
  { slot: 2, shape: 'wheel', x: 92, y: -30, fanX: 92, fanSide: 'right', ...RIGHT_TEXT },
  { slot: 3, shape: 'wheel', x: 92, y: 20, fanX: 92, fanSide: 'right', ...RIGHT_TEXT },
  { slot: 4, shape: 'wheel', x: -92, y: -30, fanX: -92, fanSide: 'left', ...LEFT_TEXT },
  { slot: 5, shape: 'wheel', x: -92, y: 20, fanX: -92, fanSide: 'left', ...LEFT_TEXT },
];

export const SOCKET_SIZE = { bar: BAR, wheel: { width: WHEEL_SIZE, height: WHEEL_SIZE } } as const;

/** Where the `count` buttons of a socket's fan end up, relative to the point they grow from: an arc on the socket's outer side. */
export function fanOffsets(count: number, side: SocketPlace['fanSide']): Array<{ x: number; y: number }> {
  const mirror = side === 'left' ? -1 : 1;
  return Array.from({ length: count }, (_, index) => {
    const angle = ((index - (count - 1) / 2) * FAN_SPREAD_DEG * Math.PI) / 180;
    return { x: Math.cos(angle) * FAN_RADIUS * mirror, y: Math.sin(angle) * FAN_RADIUS };
  });
}

/** `resources` as the editor stores them: each with its socket, in socket order. */
export function withSockets(resources: readonly ResourceDefinition[]): ResourceDefinition[] {
  return slottedResources(resources).map(({ definition, slot }) => ({ ...definition, slot }));
}

/** The resource in each socket, by slot; `undefined` for an empty one. */
export function resourcesBySocket(resources: readonly ResourceDefinition[]): Array<ResourceDefinition | undefined> {
  const sockets: Array<ResourceDefinition | undefined> = Array.from({ length: MAX_RESOURCES }, () => undefined);
  for (const { definition, slot } of slottedResources(resources)) sockets[slot] = definition;
  return sockets;
}

/** The curated colours in the order new resources take them: far apart first. */
const NEW_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#84cc16', '#06b6d4', '#ec4899', ...RESOURCE_COLORS.map(({ value }) => value)];

/** A resource for the empty socket `slot`, in a curated colour no other resource has. Its key is settled from its name when it is saved. */
export function newResourceAt(slot: number, resources: readonly ResourceDefinition[]): ResourceDefinition {
  const taken = new Set(resources.map((resource) => resource.color.toLowerCase()));
  return {
    key: draftResourceKey(),
    name: '',
    field: '',
    direction: 'drains',
    color: NEW_COLORS.find((color) => !taken.has(color)) ?? NEW_COLORS[0]!,
    visibleToPlayers: false,
    slot,
  };
}

/** `resources` with the one in socket `from` moved to socket `to`; a resource already there takes the socket left behind. */
export function movedResources(resources: readonly ResourceDefinition[], from: number, to: number): ResourceDefinition[] {
  return withSockets(withSockets(resources).map((resource) => {
    if (resource.slot === from) return { ...resource, slot: to };
    if (resource.slot === to) return { ...resource, slot: from };
    return resource;
  }));
}

/** Whether a resource was placed in this dialog and then left as it came: nothing typed. */
export function isUntouched(resource: ResourceDefinition): boolean {
  return isDraftResourceKey(resource.key) && resource.name.trim() === '' && resource.field.trim() === '';
}

/** Whether a resource can be saved: it needs a name and the statblock field its maximum comes from. */
export function isComplete(resource: ResourceDefinition): boolean {
  return resource.name.trim() !== '' && resource.field.trim() !== '';
}
