import type { Container } from 'pixi.js';
import { annotationBounds, stampBox, textBox, type TextMeasure, type TurnedBox } from '../../annotations/annotationBounds';
import type { Annotation } from '../../annotations/annotationTypes';
import { getTokenRingOuterDiameter } from '../token-renderer/tokenRingMetrics';
import { TOKEN_HANDLE_LABEL } from '../token-renderer/tokenSizing';
import type { BarsSpan, TokenGroupContainer } from '../token-renderer/types';
import { boxOutline, tokenOutline, type Box } from './selectionGeometry';
import type { SelectionTarget } from './SelectionHighlights';

/** A token without bars. */
export const NO_BARS: BarsSpan = { halfWidth: 0, reach: 0 };

/** Where the selected things are found. */
export interface SelectionSources {
  readonly tokens: Readonly<Record<string, Container>>;
  /** The drawing or text `id` of the level shown that is marked here; null for none, and for one its own handles frame. */
  annotation(id: string): Annotation | null;
  /** Sizes a text as it is drawn. */
  readonly measure?: TextMeasure;
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
    const annotation = sources.annotation(id);
    if (annotation) targets.push(annotationTarget(annotation, sources.measure));
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
  return { id, x, y, outline, extent, handles };
}

/** A text or a stamp by its turned box, any other drawing by the box around all it shows. */
function annotationTarget(annotation: Annotation, measure: TextMeasure | undefined): SelectionTarget {
  const turned: TurnedBox | null = annotation.kind === 'text' ? textBox(annotation, measure) : annotation.shape === 'stamp' ? stampBox(annotation) : null;
  if (turned) {
    const outline = { kind: 'rect', width: 2 * turned.halfWidth, height: 2 * turned.halfHeight, rotation: Math.atan2(turned.sin, turned.cos), cornerRadius: 0 } as const;
    return { id: annotation.id, x: turned.x, y: turned.y, outline };
  }
  const { minX, minY, maxX, maxY } = annotationBounds(annotation);
  const box: Box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  return { id: annotation.id, x: box.x + box.width / 2, y: box.y + box.height / 2, outline: boxOutline(box) };
}
