import React, { useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, type ValueAnimationTransition } from 'framer-motion';
import type { TokenEntity } from '../../types';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { entryConditions } from '../../initiative/combatantConditions';
import { entryToken } from '../../initiative/party';
import { tokenDisplayName } from '../../pixi/token-renderer/tokenDisplayName';
import { ConditionBadge } from '../../packages/components/shared/ConditionBadge';
import { viewFrame } from '../../packages/components/primitives/useKeepInView';
import { useElementHeight } from '../hooks/useElementHeight';
import { useMapConditions } from '../hooks/useMapConditions';
import { EASE_OUT_CONTROL_POINTS, prefersReducedMotion } from '../../utils/motion';
import type { CombatantHover } from './useCombatantHover';
import './combatant-hover-card.scss';

/** The card stays this far inside the view. */
const VIEW_MARGIN = 8;
/** It comes out of the tracker's side, a little smaller, and glides from combatant to combatant. */
const ENTER_FROM = { x: 8, scale: 0.96 };
const ENTER: ValueAnimationTransition = { type: 'spring', visualDuration: 0.22, bounce: 0 };
const GLIDE: ValueAnimationTransition = { type: 'spring', visualDuration: 0.26, bounce: 0.12 };
const EXIT: ValueAnimationTransition = { duration: 0.12, ease: EASE_OUT_CONTROL_POINTS };
const SWAP: ValueAnimationTransition = { duration: 0.16, ease: EASE_OUT_CONTROL_POINTS };

interface CombatantHoverCardProps {
  hover: CombatantHover | null;
  entries: readonly InitiativeEntry[];
  tokens: Record<string, TokenEntity>;
}

/**
 * The card beside the GM's tracker for the combatant under the pointer: its name and the conditions it is under, each
 * with the badge its token shows. It opens out of the tracker's side, glides from combatant to combatant as the pointer
 * moves down the list, its height following what it holds, and fades as the pointer leaves (`useCombatantHover`). The
 * card names the combatant already (`aria-label`), so this one is hidden from screen readers.
 */
export function CombatantHoverCard({ hover, entries, tokens }: CombatantHoverCardProps): React.ReactElement {
  const definitions = useMapConditions();
  const cardRef = useRef<HTMLDivElement>(null);
  const [contentRef, contentHeight] = useElementHeight<HTMLDivElement>();
  // What it shows stays while it fades out
  const [shownId, setShownId] = useState<string | null>(null);
  if (hover && hover.id !== shownId) setShownId(hover.id);
  const open = useRef(false);

  const x = useMotionValue(ENTER_FROM.x);
  const y = useMotionValue(0);
  const scale = useMotionValue(ENTER_FROM.scale);
  const opacity = useMotionValue(0);
  const height = useMotionValue<number | 'auto'>('auto');

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const still = prefersReducedMotion(card);
    if (!hover) {
      if (!open.current) return;
      open.current = false;
      animate(opacity, 0, EXIT);
      if (!still) animate(scale, ENTER_FROM.scale, EXIT);
      return;
    }
    const parent = card.offsetParent;
    // Measured here, for the combatant just drawn; `contentHeight` brings later changes (a condition given meanwhile)
    const inner = contentRef.current?.offsetHeight;
    if (!parent || inner === undefined) return;
    // Centred on the combatant's card, kept inside the view
    const frame = viewFrame(card);
    const anchor = hover.card.getBoundingClientRect();
    const top = parent.getBoundingClientRect().top;
    const full = inner + (card.offsetHeight - card.clientHeight) + paddingOf(card);
    const centred = anchor.top + anchor.height / 2 - full / 2;
    const place = Math.max(frame.top + VIEW_MARGIN, Math.min(centred, frame.bottom - VIEW_MARGIN - full)) - top;
    if (!open.current || still) {
      open.current = true;
      y.jump(place);
      height.jump(inner);
      if (still) {
        x.jump(0);
        scale.jump(1);
        animate(opacity, 1, EXIT);
        return;
      }
      x.jump(ENTER_FROM.x);
      scale.jump(ENTER_FROM.scale);
      animate(x, 0, ENTER);
      animate(scale, 1, ENTER);
      animate(opacity, 1, ENTER);
      return;
    }
    animate(y, place, GLIDE);
    animate(height, inner, GLIDE);
  }, [hover, shownId, contentHeight, contentRef, x, y, scale, opacity, height]);

  const entry = shownId === null ? undefined : entries.find((candidate) => candidate.id === shownId);
  const token = entry ? entryToken(tokens, entry) : undefined;
  const name = entry ? (token && tokenDisplayName(token)) || entry.name : '';
  const conditions = entry ? entryConditions(entry, token, definitions) : [];

  return (
    <motion.div ref={cardRef} className="atlas-combatant-card" aria-hidden="true" style={{ x, y, scale, opacity }}>
      <motion.div className="atlas-combatant-card__clip" style={{ height }}>
        <div ref={contentRef}>
          {entry && (
            <motion.div key={entry.id} className="atlas-combatant-card__content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SWAP}>
              <span className="atlas-combatant-card__name">{name}</span>
              {conditions.length > 0 && (
                <ul className="atlas-combatant-card__conditions">
                  {conditions.map((condition) => (
                    <li key={condition.id} className="atlas-combatant-card__condition">
                      <ConditionBadge condition={{ color: condition.color, glyph: condition.glyph }} size={18} />
                      <span>{condition.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** The card's padding above and below its content. */
function paddingOf(card: HTMLElement): number {
  const style = card.ownerDocument.defaultView?.getComputedStyle(card);
  return style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
}
