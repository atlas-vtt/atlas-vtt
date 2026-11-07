import { Point, type Container } from 'pixi.js';
import type { DrawingStroke } from '../../types';
import { getDrawingBounds } from '../drawingGeometry';
import { getTokenRingOuterDiameter } from '../token-renderer/tokenRingMetrics';
import { TOKEN_HANDLE_LABEL } from '../token-renderer/tokenSizing';
import type { BarsSpan, TokenGroupContainer } from '../token-renderer/types';
import { boxOutline, tokenOutline, type Box } from './selectionGeometry';
import type { SelectionTarget } from './SelectionHighlights';

/** A token without bars. */
export const NO_BARS: BarsSpan = { halfWidth: 0, reach: 0 };

/** Where the selected things are found. */
export interface SelectionSources {
  /** The world the things stand in (the viewport). */
  readonly world: Container;
  readonly tokens: Readonly<Record<string, Container>>;
  readonly drawings: Readonly<Record<string, DrawingStroke>>;
  readonly fog: Readonly<Record<string, Container>>;
  /** How far a token's bars stand out from it, in world units. */
  bars(tokenId: string): BarsSpan;
}

/** What the canvas shows of each selected thing, in the order of `ids`; a token it hides has none. */
export function selectionTargets(ids: readonly string[], sources: SelectionSources): SelectionTarget[] {
  const targets: SelectionTarget[] = [];
  for (const id of ids) {
    const token = sources.tokens[id];
    if (token?.visible) {
      const target = tokenTarget(id, token as Partial<TokenGroupContainer> & Container, sources);
      if (target) targets.push(target);
      continue;
    }
    const drawing = sources.drawings[id];
    const drawingBounds = drawing ? getDrawingBounds(drawing) : null;
    if (drawingBounds) {
      targets.push(boxTarget(id, drawingBounds, true));
      continue;
    }
    const fog = sources.fog[id];
    if (fog && !fog.destroyed) targets.push(boxTarget(id, worldBounds(fog, sources.world), false));
  }
  return targets;
}

function tokenTarget(id: string, group: Partial<TokenGroupContainer> & Container, sources: SelectionSources): SelectionTarget | null {
  const art = group.getChildByLabel('tokenSprite') ?? group.children[0];
  const tokenSize = typeof group.tokenSize === 'number' && group.tokenSize > 0 ? group.tokenSize : art?.width ?? 0;
  if (!art || !(tokenSize > 0)) return null;
  const framed = group.tokenData?.showRing !== false;
  // The ring as drawn, which the scene's ring size may have scaled
  const ring = group.getChildByLabel('tokenRing');
  const outline = tokenOutline({
    tokenSize,
    ringDiameter: framed ? (ring?.width || getTokenRingOuterDiameter(tokenSize, group.strokeWidth)) : null,
    art: { width: art.width, height: art.height, rotation: art.rotation },
  });
  const { x, y } = group.position;
  const bars = sources.bars(id);
  const halfWidth = Math.max(tokenSize / 2, bars.halfWidth);
  const extent = bars.reach > 0 ? { x: x - halfWidth, y: y - tokenSize / 2, width: 2 * halfWidth, height: tokenSize + bars.reach } : undefined;
  const handles = group.children
    .filter((child) => child.label === TOKEN_HANDLE_LABEL && child.visible)
    .map((handle) => ({ x: handle.x, y: handle.y, radius: Math.max(handle.width, handle.height) / 2 }));
  return { id, x, y, outline, extent, handles, grouped: true };
}

function boxTarget(id: string, box: Box, grouped: boolean): SelectionTarget {
  return { id, x: box.x + box.width / 2, y: box.y + box.height / 2, outline: boxOutline(box), grouped };
}

/** `node`'s bounds in the coordinates of `world`, which neither turns nor skews. */
function worldBounds(node: Container, world: Container): Box {
  const bounds = node.getBounds();
  const topLeft = world.toLocal(new Point(bounds.minX, bounds.minY));
  const bottomRight = world.toLocal(new Point(bounds.maxX, bounds.maxY));
  return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
}
