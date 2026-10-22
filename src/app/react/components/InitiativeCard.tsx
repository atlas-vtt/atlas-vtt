import { useMapResources } from '../../resources/useMapResources';
import { combatantDefeated } from '../../initiative/defeated';
import { visibleResources } from '../../resources/visibleResources';
import React, { useCallback, useRef, useState } from 'react';
import { EyeOff, GripVertical, Skull, User, Bot } from 'lucide-react';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { focusCombatant } from '../../initiative/focusCombatant';
import { cardInstanceNumber } from '../../initiative/cardInstanceNumber';
import { hasInitiative } from '../../initiative/awaitingInitiative';
import { tokenDisplayName } from '../../pixi/token-renderer/tokenDisplayName';
import { isOffMap } from '../../tokens/offMap';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../packages/components/shared/TokenPortrait';
import { InitiativeNumber, type NumberStep } from './InitiativeNumber';
import { CardResourceBars } from './CardResourceBars';
import { OffMapIcon } from './OffMapIcon';
import { CardConditions } from './CardConditions';
import { useMapConditions } from '../hooks/useMapConditions';
import { combatantConditions } from '../../utils/activeConditions';
import { useCardPreviewHover } from './useCardPreviewHover';
import { t } from '../../i18n';
import { DealtCard } from './DealtCard';

interface InitiativeCardProps {
  entry: InitiativeEntry;
  index: number;
  isHoveredForPreview: boolean;
  /** The fight runs by sides: a combatant has no number there and never the turn by itself. */
  bySides?: boolean;
  /** The fight runs by cards: the card dealt stands where the number does. */
  byCards?: boolean;
  /** The GM chose to see names on the cards. */
  showName?: boolean;
  /** The side tooltips open on: away from the edge the tracker stands at. */
  tooltipSide?: 'left' | 'right';
  /** The card's number is being typed in place. */
  isEditingNumber?: boolean;
  onStartNumberEdit?: (entry: InitiativeEntry) => void;
  onCommitNumber?: (entry: InitiativeEntry, text: string, step: NumberStep) => void;
  onCancelNumberEdit?: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement) => void;
  onHover: (entry: InitiativeEntry | null, cardElement?: HTMLElement) => void;
}

const NOTHING = (): void => undefined;

/**
 * Individual initiative tracker card
 * Displays the token as the map shows it (its ring, or unframed), its initiative value and the bars of its resources
 */
export const InitiativeCard: React.FC<InitiativeCardProps> = ({
  entry,
  index,
  isHoveredForPreview,
  bySides = false,
  byCards = false,
  showName = false,
  tooltipSide = 'left',
  isEditingNumber = false,
  onStartNumberEdit = NOTHING,
  onCommitNumber = NOTHING,
  onCancelNumberEdit = NOTHING,
  onDragStart,
  onDragOver,
  onDragEnd,
  onContextMenu,
  onHover,
}) => {
  const { app, view } = useAtlasUI();
  const store = useViewStoreHook();
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const badgesOn = useAtlasStore((s) => s.tokenSettings?.showInstanceBadges ?? true);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hover = useCardPreviewHover(cardRef, entry, isHoveredForPreview, onHover);

  // The number its token's badge shows on the map, where look-alikes are told apart
  const instanceBadge = cardInstanceNumber(tokens, entry.tokenId, badgesOn);

  // Read live from the token: the resources that defeat it (hit points), and whether one of them has
  const definitions = useMapResources();
  const conditionDefinitions = useMapConditions();
  const token = tokens[entry.tokenId];
  const bars = token ? visibleResources(token, definitions, 'dm').filter(({ definition }) => definition.defeatedWhenSpent) : [];
  const defeated = combatantDefeated(token, definitions);
  const conditions = combatantConditions(token, conditionDefinitions);
  // A hidden token's entry is left out of the players' list (`PlayerInitiativePanel`)
  const hiddenFromPlayers = token?.isHidden === true;
  // Kept beside the map: in the tracker only, until the GM places it
  const offMap = isOffMap(token);
  const name = (token && tokenDisplayName(token)) || entry.name;

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

  // A click selects the token as a click on the map does (Shift adds) and brings it into view
  const handleClick = (e: React.MouseEvent): void => {
    focusCombatant(view, store.getState(), entry.tokenId, e.shiftKey);
  };

  // Build class names
  const cardClasses = [
    'atlas-initiative-card',
    entry.isActive && !bySides && 'atlas-initiative-card--active',
    defeated && 'atlas-initiative-card--defeated',
    hiddenFromPlayers && 'atlas-initiative-card--hidden',
    entry.sitsOut && 'atlas-initiative-card--sitting-out',
    entry.delayed && 'atlas-initiative-card--delayed',
    isHoveredForPreview && 'atlas-initiative-card--preview-hover',
    dropPosition === 'above' && 'atlas-initiative-card--drop-above',
    dropPosition === 'below' && 'atlas-initiative-card--drop-below',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      // A field being typed in keeps its text selection to itself
      draggable={!isEditingNumber}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      {...hover}
      role="listitem"
      aria-roledescription={t('initiative.card')}
      aria-label={name}
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
            alt={name}
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
          <LabelTooltip label={t('initiative.hiddenFromPlayers')} side={tooltipSide}>
            <span className="atlas-initiative-card__hidden-badge"><EyeOff /></span>
          </LabelTooltip>
        )}

        {offMap && (
          <LabelTooltip label={t('initiative.offMap')} side={tooltipSide}>
            <span className="atlas-initiative-card__off-map-badge"><OffMapIcon /></span>
          </LabelTooltip>
        )}
      </div>

      {showName && <span className="atlas-initiative-card__name" aria-hidden="true">{name}</span>}

      {/* Initiative number, typed in place; in a fight by cards the card dealt, which nothing edits */}
      {!bySides && (byCards ? <DealtCard card={entry.card} /> : (
        <InitiativeNumber
          value={entry.initiative}
          empty={!hasInitiative(entry)}
          editing={isEditingNumber}
          onStartEdit={() => onStartNumberEdit(entry)}
          onCommit={(text, step) => onCommitNumber(entry, text, step)}
          onCancel={onCancelNumberEdit}
        />
      ))}

      {bars.length > 0 && <CardResourceBars tokenId={entry.tokenId} bars={bars} />}

      <CardConditions conditions={conditions} tooltipSide={tooltipSide} />
    </div>
  );
};
