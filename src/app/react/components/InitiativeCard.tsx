import { useMapResources } from '../../resources/useMapResources';
import { isDefeated } from '../../resources/resourceValues';
import { resourceColor } from '../../resources/resourceColors';
import { visibleResources } from '../../resources/visibleResources';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, GripVertical, Skull, User, Bot } from 'lucide-react';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';
import { zoomToTokenWithHighlight } from '../../pixi/utils/tokenHighlight';
import { isModHeld, isModKey } from '../../keyboard/modKey';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../packages/components/shared/TokenPortrait';
import { t } from '../../i18n';

interface InitiativeCardProps {
  entry: InitiativeEntry;
  index: number;
  isHoveredForPreview: boolean;
  /** The fight runs by sides: a combatant has no number there and never the turn by itself. */
  bySides?: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement) => void;
  onHover: (entry: InitiativeEntry | null, cardElement?: HTMLElement) => void;
}

/**
 * Individual initiative tracker card
 * Displays the token as the map shows it (its ring, or unframed), its initiative value and the bars of its resources
 */
export const InitiativeCard: React.FC<InitiativeCardProps> = ({
  entry,
  index,
  isHoveredForPreview,
  bySides = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onContextMenu,
  onHover,
}) => {
  const { app, view } = useAtlasUI();
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const tokenSettings = useAtlasStore((s) => s.tokenSettings);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isPointerInsideRef = useRef(false);
  const isModifierKeyDownRef = useRef(false);

  // Instance badge: show when 2+ tokens share the same imagePath
  const instanceBadge = useMemo((): number | null => {
    if (!(tokenSettings?.showInstanceBadges ?? true)) return null;
    const token = tokens[entry.tokenId];
    if (!token?.instanceNumber) return null;
    const sameImageCount = Object.values(tokens).filter(
      (t) => t.imagePath === token.imagePath,
    ).length;
    return sameImageCount >= 2 ? token.instanceNumber : null;
  }, [tokens, entry.tokenId, tokenSettings?.showInstanceBadges]);

  // Read live from the token: the resources that defeat it (hit points), and whether one of them has
  const definitions = useMapResources();
  const token = tokens[entry.tokenId];
  const bars = token ? visibleResources(token, definitions, 'dm').filter(({ definition }) => definition.defeatedWhenSpent) : [];
  const defeated = token !== undefined && isDefeated(token, definitions);
  // A hidden token's entry is left out of the players' list (`PlayerInitiativePanel`)
  const hiddenFromPlayers = token?.isHidden === true;

  // Get image URL from vault path
  const getImageUrl = useCallback((imagePath: string): string => {
    if (!imagePath || !app) return '';

    // Handle already-resolved URLs
    if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('blob:')) {
      return imagePath;
    }

    // Resolve vault path to resource URL
    try {
      return app.vault.adapter.getResourcePath(imagePath);
    } catch {
      return '';
    }
  }, [app]);

  const triggerPreviewIfEligible = useCallback((): void => {
    if (!isModifierKeyDownRef.current || !entry.statblockPath || !cardRef.current || isHoveredForPreview) {
      return;
    }

    onHover(entry, cardRef.current);
  }, [entry, isHoveredForPreview, onHover]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isModKey(event)) {
        return;
      }

      isModifierKeyDownRef.current = true;

      // A card hidden with its map view (another tab took over) never got its mouseleave.
      if (isPointerInsideRef.current && cardRef.current?.checkVisibility()) {
        triggerPreviewIfEligible();
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (!isModKey(event)) {
        return;
      }

      isModifierKeyDownRef.current = false;
    };

    const handleWindowBlur = (): void => {
      isModifierKeyDownRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [triggerPreviewIfEligible]);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    onDragStart(index);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Determine if dropping above or below
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) {
      const midY = rect.top + rect.height / 2;
      setDropPosition(e.clientY < midY ? 'above' : 'below');
    }

    onDragOver(index);
  };

  // Handle drag leave
  const handleDragLeave = (): void => {
    setDropPosition(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDropPosition(null);
    onDragEnd();
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (cardRef.current) {
      onContextMenu(e, entry, cardRef.current);
    }
  };

  // Handle hover for statblock preview (CMD+hover)
  // Preview stays open while CMD is held - only closes on CMD release
  const handleMouseEnter = (e: React.MouseEvent): void => {
    isPointerInsideRef.current = true;
    isModifierKeyDownRef.current = isModHeld(e) || isModifierKeyDownRef.current;
    triggerPreviewIfEligible();
  };

  const handleMouseMove = (e: React.MouseEvent): void => {
    isModifierKeyDownRef.current = isModHeld(e) || isModifierKeyDownRef.current;
    triggerPreviewIfEligible();
  };

  // Don't close on mouse leave - CMD release handles closing
  const handleMouseLeave = (): void => {
    isPointerInsideRef.current = false;
  };

  // Handle click to zoom to token
  const handleClick = useCallback((): void => {
    const token = tokens[entry.tokenId];
    if (!token || !view) return;

    zoomToTokenWithHighlight(view, entry.tokenId, { x: token.x, y: token.y });
  }, [entry.tokenId, tokens, view]);

  // Build class names
  const cardClasses = [
    'atlas-initiative-card',
    entry.isActive && !bySides && 'atlas-initiative-card--active',
    defeated && 'atlas-initiative-card--defeated',
    hiddenFromPlayers && 'atlas-initiative-card--hidden',
    entry.sitsOut && 'atlas-initiative-card--sitting-out',
    isHoveredForPreview && 'atlas-initiative-card--preview-hover',
    dropPosition === 'above' && 'atlas-initiative-card--drop-above',
    dropPosition === 'below' && 'atlas-initiative-card--drop-below',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      draggable
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      role="listitem"
      aria-roledescription={t('initiative.card')}
    >
      {/* Drag Handle */}
      <div className="atlas-initiative-card__drag-handle">
        <GripVertical />
      </div>

      {/* Avatar with optional instance badge */}
      <div className="atlas-initiative-card__avatar-wrapper">
        {entry.imagePath ? (
          <TokenPortrait
            className="atlas-initiative-card__portrait"
            src={getImageUrl(entry.imagePath)}
            alt={entry.name}
            showRing={token?.showRing !== false}
            ringColor={token?.ringColor}
          />
        ) : (
          <div className="atlas-initiative-card__avatar">
            {entry.isNPC ? <Bot /> : <User />}
          </div>
        )}

        {/* Defeated overlay */}
        {defeated && (
          <div className="atlas-initiative-card__defeated-overlay">
            <Skull />
          </div>
        )}

        {instanceBadge != null && (
          <span className="atlas-initiative-card__instance-badge">{instanceBadge}</span>
        )}

        {hiddenFromPlayers && (
          <LabelTooltip label={t('initiative.hiddenFromPlayers')} side="left">
            <span className="atlas-initiative-card__hidden-badge"><EyeOff /></span>
          </LabelTooltip>
        )}
      </div>

      {/* Initiative number */}
      {!bySides && (
        <span className="atlas-initiative-card__initiative">
          {entry.initiative}
        </span>
      )}

      {/* Resource bars */}
      {bars.length > 0 && (
        <div className="atlas-initiative-card__resources">
          {bars.map(({ definition, value }) => (
            <div
              key={definition.key}
              className="atlas-initiative-card__hp-bar"
              role="meter"
              aria-label={definition.name}
              aria-valuemin={0}
              aria-valuenow={value.current}
              aria-valuemax={value.max}
            >
              <div
                className="atlas-initiative-card__hp-fill"
                style={{ width: `${Math.max(0, Math.min(100, (value.current / value.max) * 100))}%`, '--atlas-resource-color': resourceColor(definition, value) } as React.CSSProperties}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
