import { useMapResources } from '../../resources/useMapResources';
import { TURN_KEY_ATTRIBUTE } from '../../initiative/motion/turnMotion';
import { combatantDefeated } from '../../initiative/defeated';
import { visibleResources } from '../../resources/visibleResources';
import React, { useCallback, useRef } from 'react';
import { EyeOff, Skull, User, Bot } from 'lucide-react';
import { DRAG_GROUP_ATTRIBUTE, type RowDrag } from '../hooks/useRowDrag';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { focusCombatant } from '../../initiative/focusCombatant';
import { cardInstanceNumber } from '../../initiative/cardInstanceNumber';
import { hasInitiative } from '../../initiative/awaitingInitiative';
import { tokenDisplayName } from '../../pixi/token-renderer/tokenDisplayName';
import { isOffMap } from '../../tokens/offMap';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { InitiativeNumber, type NumberStep } from './InitiativeNumber';
import { OffMapIcon } from './OffMapIcon';
import { woundShare } from '../../initiative/woundShare';
import { useCardPreviewHover } from './useCardPreviewHover';
import { useArtViewBox } from './useArtViewBox';
import { t } from '../../i18n';
import { DealtCard } from './DealtCard';
import { entryToken } from '../../initiative/party';
import { turnColor } from '../../initiative/turnColor';
import { sideOf } from '../../initiative/sides';

interface InitiativeCardProps {
  entry: InitiativeEntry;
  /** Its place in the list as it is drawn, and the group it is dragged within (`useRowDrag`); without a drag it stays put. */
  place?: number;
  group?: string;
  drag?: RowDrag;
  isHoveredForPreview: boolean;
  /** The fight runs by sides: a combatant has no number there and never the turn by itself. */
  bySides?: boolean;
  /** The fight runs by cards: the card dealt stands where the number does. */
  byCards?: boolean;
  /** The GM chose to see names on the cards. */
  showName?: boolean;
  /** The compact list: no portrait, its marks beside the name. */
  compact?: boolean;
  /** The side tooltips open on: away from the edge the tracker stands at. */
  tooltipSide?: 'left' | 'right';
  /** The card's number is being typed in place. */
  isEditingNumber?: boolean;
  onStartNumberEdit?: (entry: InitiativeEntry) => void;
  onCommitNumber?: (entry: InitiativeEntry, text: string, step: NumberStep) => void;
  onCancelNumberEdit?: () => void;
  onContextMenu: (e: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement) => void;
  onHover: (entry: InitiativeEntry | null, cardElement?: HTMLElement) => void;
  /** Its turn just began: it lights up once (`initiative-turn-flash`), as on the players' list. */
  turnFlash?: boolean;
}

const NOTHING = (): void => undefined;
const NO_DRAG: RowDrag = {
  onPointerDown: NOTHING, onPointerMove: NOTHING, onPointerUp: NOTHING, onPointerCancel: NOTHING,
  offsetOf: () => undefined, held: null, settling: false,
};

/**
 * A combatant in the GM's tracker, as the players' list draws it (`styles/_initiative-cards.scss`): a square card
 * filled with the token's art, red rising in it as it loses hit points (`woundShare`), its number in the top right and
 * its badge and marks in the top left. Conditions and resources show on its token, so the card leaves them out. The compact list is one line instead, over the token's art faded in from its right end.
 */
export const InitiativeCard: React.FC<InitiativeCardProps> = ({
  entry,
  place = 0,
  group,
  drag = NO_DRAG,
  isHoveredForPreview,
  bySides = false,
  byCards = false,
  showName = false,
  compact = false,
  tooltipSide = 'left',
  isEditingNumber = false,
  onStartNumberEdit = NOTHING,
  onCommitNumber = NOTHING,
  onCancelNumberEdit = NOTHING,
  onContextMenu,
  onHover,
  turnFlash = false,
}) => {
  const { app, view } = useAtlasUI();
  const store = useViewStoreHook();
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const badgesOn = useAtlasStore((s) => s.tokenSettings?.showInstanceBadges ?? true);
  const levels = useAtlasStore((s) => s.levels);
  // Its token is selected on the map (a click on the card selects it)
  const selected = useAtlasStore((s) => entry.tokenId !== undefined && s.selectedIds.includes(entry.tokenId));
  const cardRef = useRef<HTMLDivElement>(null);
  const hover = useCardPreviewHover(cardRef, entry, isHoveredForPreview, onHover);

  // The number its token's badge shows on the map, where look-alikes on its level are told apart
  const instanceBadge = cardInstanceNumber(tokens, entry.tokenId, badgesOn, levels);

  // Read live from the token: how much of the resources that defeat it (hit points) it has lost, and whether one is spent
  const definitions = useMapResources();
  const token = entryToken(tokens, entry);
  const wound = token ? woundShare(visibleResources(token, definitions, 'dm').filter(({ definition }) => definition.defeatedWhenSpent)) : null;
  const woundFill = wound === null ? null : <div className="atlas-initiative-wound" style={{ '--atlas-wound': wound } as React.CSSProperties} aria-hidden="true" />;
  const defeated = combatantDefeated(token, definitions);
  // A hidden token's entry, or one the GM hid, is left out of the players' list (`PlayerInitiativePanel`)
  const hiddenFromPlayers = token?.isHidden === true || entry.hiddenFromPlayers === true;
  // Kept beside the map: in the tracker only, until the GM places it
  const offMap = isOffMap(token);
  const name = (token && tokenDisplayName(token)) || entry.name;
  // The colour its turn pulses in: its token's ring colour
  const turn = turnColor(token);
  // Only the players' own side is framed: a player at the table has no token
  const playerSide = entry.partyMemberId !== undefined || (token !== undefined && sideOf(token) === 'players');

  // The art without the transparent margins its image may have (a token cropped zoomed out), so it fills the card
  const artViewBox = useArtViewBox(app, entry.imagePath);
  const artStyle = artViewBox ? ({ '--atlas-art-view-box': artViewBox } as React.CSSProperties) : undefined;

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

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (cardRef.current) {
      onContextMenu(e, entry, cardRef.current);
    }
  };

  // A click selects the token as a click on the map does (Shift adds) and brings it into view; on a
  // player at the table, who has no token, it types in the number they rolled
  const handleClick = (e: React.MouseEvent): void => {
    if (entry.tokenId !== undefined) focusCombatant(view, store.getState(), entry.tokenId, e.shiftKey);
    else if (!bySides && !byCards) onStartNumberEdit(entry);
  };

  // Its badge number and what the players do not see of it, at the portrait's corners or beside the name
  const marks = (
    <>
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
    </>
  );

  // Build class names
  const cardClasses = [
    'atlas-initiative-card',
    !compact && 'atlas-initiative-card--tile',
    playerSide && 'atlas-initiative-card--ally',
    entry.isActive && !bySides && 'atlas-initiative-card--active',
    defeated && 'atlas-initiative-card--defeated',
    hiddenFromPlayers && 'atlas-initiative-card--hidden',
    entry.sitsOut && 'atlas-initiative-card--sitting-out',
    entry.delayed && 'atlas-initiative-card--delayed',
    isHoveredForPreview && 'atlas-initiative-card--preview-hover',
    selected && 'atlas-initiative-card--selected',
    turnFlash && 'atlas-initiative-card--turn-flash',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      style={{ translate: drag.offsetOf(place), ...(turn && { '--atlas-turn-color': turn }) }}
      data-held={drag.held === place ? '' : undefined}
      {...{ [DRAG_GROUP_ATTRIBUTE]: group }}
      // A field being typed in keeps its pointer to itself
      onPointerDown={(event) => { if (!isEditingNumber) drag.onPointerDown(place, event); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      {...hover}
      role="listitem"
      // It glides to its new place as the turn passes (`turnMotion.ts`)
      {...{ [TURN_KEY_ATTRIBUTE]: entry.id }}
      aria-roledescription={t('initiative.card')}
      aria-label={name}
    >
      {/* The token's art filling the card, with its badge and marks in the top left; the compact list shows the marks alone, beside the name */}
      {compact ? (
        <>
          {entry.imagePath && (
            // The token's art faded in behind the line, from its right end
            <div className={`atlas-initiative-card__backdrop${token?.showRing === false ? ' atlas-initiative-card__backdrop--framed' : ''}`} aria-hidden="true">
              <img src={getImageUrl(entry.imagePath)} alt="" draggable={false} decoding="async" style={artStyle} />
              {woundFill}
            </div>
          )}
          <span className="atlas-initiative-card__marks">{defeated && <Skull className="atlas-initiative-card__defeated-mark" />}{marks}</span>
        </>
      ) : (
        <>
          {entry.imagePath ? (
            // The card names the combatant (`aria-label`): its art is a picture no one needs read again
            <div className={`atlas-initiative-card__art${token?.showRing === false ? ' atlas-initiative-card__art--framed' : ''}`} aria-hidden="true">
              <img src={getImageUrl(entry.imagePath)} alt="" draggable={false} decoding="async" style={artStyle} />
              {woundFill}
            </div>
          ) : (
            <div className="atlas-initiative-card__avatar">
              {entry.isNPC ? <Bot /> : <User />}
            </div>
          )}
          {defeated && (
            <div className="atlas-initiative-card__defeated-overlay">
              <Skull />
            </div>
          )}
          <span className="atlas-initiative-card__marks">{marks}</span>
        </>
      )}

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

    </div>
  );
};
