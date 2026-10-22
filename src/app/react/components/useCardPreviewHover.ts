import React, { useCallback, useEffect, useRef } from 'react';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { isModHeld, isModKey } from '../../keyboard/modKey';

/** The pointer handlers a card hands its element. */
export interface CardHoverHandlers {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
}

/**
 * Mod (Cmd on macOS, Ctrl elsewhere) held over a card opens its statblock: pressed while the
 * pointer rests on the card, or held while it comes in or moves. A pointer event says whether Mod
 * is held, so it is believed over what the keys said: a release that was never heard must not open
 * previews without Mod. Leaving the card without Mod ends the preview (`onHover(null)`); with Mod
 * the preview stays, so the pointer can move into it. Keys are heard in the capture phase, since a
 * pinned note preview keeps the keys pressed in it to itself.
 */
export function useCardPreviewHover(
  cardRef: React.RefObject<HTMLElement | null>,
  entry: InitiativeEntry,
  isHoveredForPreview: boolean,
  onHover: (entry: InitiativeEntry | null, cardElement?: HTMLElement) => void,
): CardHoverHandlers {
  const isPointerInsideRef = useRef(false);
  const isModifierKeyDownRef = useRef(false);

  const triggerPreviewIfEligible = useCallback((): void => {
    if (!isModifierKeyDownRef.current || !entry.statblockPath || !cardRef.current || isHoveredForPreview) return;
    onHover(entry, cardRef.current);
  }, [cardRef, entry, isHoveredForPreview, onHover]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isModKey(event)) return;
      isModifierKeyDownRef.current = true;
      // A card hidden with its map view (another tab took over) never got its mouseleave.
      if (isPointerInsideRef.current && cardRef.current?.checkVisibility()) triggerPreviewIfEligible();
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (isModKey(event)) isModifierKeyDownRef.current = false;
    };
    const handleWindowBlur = (): void => {
      isModifierKeyDownRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [cardRef, triggerPreviewIfEligible]);

  const followPointer = (e: React.MouseEvent): void => {
    isModifierKeyDownRef.current = isModHeld(e);
    triggerPreviewIfEligible();
  };

  return {
    onMouseEnter: (e) => {
      isPointerInsideRef.current = true;
      followPointer(e);
    },
    onMouseMove: followPointer,
    onMouseLeave: (e) => {
      isPointerInsideRef.current = false;
      if (!isModHeld(e)) onHover(null);
    },
  };
}
