import { LIMITED_WALLS } from '../../featureFlags';
import { readLight, readWall } from '../../lighting/lightingObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import type { WallChannel } from '../../types/wallTypes';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { DoorPlacement } from '../vision/DoorPlacement';
import type { WallInteraction } from '../vision/WallInteraction';
import type { WallRenderer } from '../vision/WallRenderer';
import { removeDoor, removeJoint } from './wallJoints';
import { t } from '../../i18n';
import { levelObjects } from '../../levels/levelObjects';

export interface LightingMenuContext {
  store: ViewAtlasStore;
  walls: WallInteraction;
  doors: DoorPlacement;
  wallRenderer: WallRenderer;
  /** The light whose marker is at the world point. */
  lightAt: (worldX: number, worldY: number) => string | null;
}

export function showLightMenu(context: LightingMenuContext, lightId: string, screenX: number, screenY: number): void {
  const light = readLight(levelObjects(context.store.getState()).lights[lightId]);
  if (!light) return;
  const entries: ContextMenuEntry[] = [
    { type: 'item', label: t('light.configure'), icon: 'settings', onClick: () => context.store.getState().openLightPopover(lightId) },
    {
      type: 'item',
      label: light.hidden ? t('light.turnOn') : t('light.turnOff'),
      icon: light.hidden ? 'lightbulb' : 'lightbulb-off',
      onClick: () => context.store.getState().updateLight(lightId, { hidden: !light.hidden }),
    },
    { type: 'item', label: t('light.delete'), icon: 'trash-2', onClick: () => context.store.getState().deleteLight(lightId) },
  ];
  openContextMenuGlobal(entries, { x: screenX, y: screenY });
}

/** What a door offers: to open or close it, and to lock it; a locked door only to unlock it. Nothing for a wall that is no door. */
export function doorMenuEntries(store: ViewAtlasStore, wallId: string): ContextMenuEntry[] {
  const wall = readWall(levelObjects(store.getState()).walls[wallId]);
  if (!wall || (wall.type !== 'door' && wall.type !== 'secret-door')) return [];
  if (wall.locked) return [{ type: 'item', label: 'Unlock door', icon: 'lock-open', onClick: () => store.getState().setDoorLocked(wallId, false) }];
  const closed = wall.closed ?? true;
  return [
    { type: 'item', label: closed ? 'Open door' : 'Close door', icon: closed ? 'door-open' : 'door-closed', onClick: () => store.getState().toggleDoor(wallId) },
    { type: 'item', label: 'Lock door', icon: 'lock', onClick: () => store.getState().setDoorLocked(wallId, true) },
  ];
}

/** A door badge's context menu, with any tool. */
export function showDoorMenu(store: ViewAtlasStore, wallId: string, screenX: number, screenY: number): void {
  const entries = doorMenuEntries(store, wallId);
  if (entries.length > 0) openContextMenuGlobal(entries, { x: screenX, y: screenY });
}

/** The wall tool's context menu: a light under the pointer, else the wall selection. */
export function showWallMenu(context: LightingMenuContext, worldX: number, worldY: number, screenX: number, screenY: number): void {
  const { walls, wallRenderer, store } = context;
  const lightId = context.lightAt(worldX, worldY);
  if (lightId) {
    showLightMenu(context, lightId, screenX, screenY);
    return;
  }

  // A right-click on an unselected wall selects it first, with its chain. Not as a press would: that opens a door, and takes hold of a wall's end.
  const allWalls = levelObjects(store.getState()).walls;
  const vertexHit = wallRenderer.hitTestVertices(worldX, worldY);
  const joint = vertexHit ? allWalls[vertexHit.wallId]?.[vertexHit.vertex] : undefined;
  const segmentId = joint ? null : wallRenderer.hitTestWalls(worldX, worldY);
  const hitWallId = segmentId ?? vertexHit?.wallId;
  if (hitWallId && !walls.getSelectedWallIds().includes(hitWallId)) walls.selectWallChain(hitWallId, false);
  if (!walls.hasSelection()) return;

  const selected = walls.getSelectedWallIds();
  const directions = new Set(selected.map((id) => allWalls[id]?.direction ?? 'both'));
  // The wall under the pointer, also one of a chain; without one, the one wall selected.
  const segment = (segmentId ? allWalls[segmentId] : undefined) ?? (selected.length === 1 ? allWalls[selected[0]!] : undefined);
  const at = segmentId ? { x: worldX, y: worldY } : undefined;
  const entries: ContextMenuEntry[] = [];

  if (segment?.type === 'solid') {
    entries.push(
      { type: 'item', label: t('wall.placeDoor'), icon: 'door-open', onClick: () => context.doors.start(segment.id, 'door', at) },
      { type: 'item', label: t('wall.placeSecretDoor'), icon: 'lock', onClick: () => context.doors.start(segment.id, 'secret-door', at) },
    );
  }

  if (segment) {
    entries.push(...doorMenuEntries(store, segment.id));
    const doorRemoval = removeDoor(allWalls, segment.id);
    if (doorRemoval) entries.push({ type: 'item', label: 'Remove door', icon: 'brick-wall', onClick: () => walls.apply(doorRemoval) });
  }

  const jointRemoval = joint ? removeJoint(allWalls, joint) : null;
  if (jointRemoval) entries.push({ type: 'item', label: 'Remove point', icon: 'circle-minus', onClick: () => walls.apply(jointRemoval) });

  const direction = (label: string, value: 'left' | 'right' | undefined): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: directions.size === 1 && directions.has(value ?? 'both'),
    onClick: () => walls.updateSelected({ direction: value }),
  });
  entries.push({
    type: 'submenu',
    label: t('wall.direction'),
    icon: 'arrow-left-right',
    children: [direction(t('wall.blockBoth'), undefined), direction(t('wall.allowLeft'), 'left'), direction(t('wall.allowRight'), 'right')],
  });

  // What the selected walls block, as they are read (a kind that is none reads as both).
  const kinds = new Set(selected.map((id) => readWall(allWalls[id])?.blocks ?? 'both'));
  const blocks = (label: string, value: WallChannel | undefined): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: kinds.size === 1 && kinds.has(value ?? 'both'),
    onClick: () => walls.updateSelected({ blocks: value }),
  });
  entries.push({
    type: 'submenu',
    label: 'Blocks',
    icon: 'eye-off',
    children: [blocks('Sight and light', undefined), blocks('Sight only', 'sight'), blocks('Light only', 'light')],
  });
  // A hedge or a low wall: on while every selected wall is limited, and then takes it from all of them.
  if (LIMITED_WALLS) {
    const allLimited = selected.every((id) => readWall(allWalls[id])?.limited);
    entries.push({ type: 'item', label: 'Limited (see past the first)', icon: 'grip-horizontal', checked: allLimited, onClick: () => walls.updateSelected({ limited: allLimited ? undefined : true }) });
  }

  if (segmentId && selected.length > 1) {
    entries.push({ type: 'item', label: 'Delete this wall', icon: 'trash', onClick: () => walls.apply({ remove: [segmentId], add: [] }) });
  }
  entries.push({
    type: 'item',
    label: selected.length > 1 ? t('wall.deleteMany', { count: selected.length }) : t('common.delete'),
    icon: 'trash-2',
    onClick: () => walls.deleteSelected(),
  });
  openContextMenuGlobal(entries, { x: screenX, y: screenY });
}
